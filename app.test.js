const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

const { createApp, createMemoryDb, DEFAULT_DATA, hashPassword } = require('./app');

function createSeedData(overrides = {}) {
  // Ensure we assign user_id: 1 to default mock data if not overridden
  const mockUserId = 1;
  const mapWithUserId = (items) => items.map(item => ({ ...item, user_id: mockUserId }));

  return {
    users: [
      {
        id: mockUserId,
        name: 'User MyMoney',
        email: 'user@mymoney.local',
        password_hash: hashPassword('user12345'),
        role: 'user'
      },
      ...(overrides.users || [])
    ],
    transactions: mapWithUserId([...DEFAULT_DATA.transactions, ...(overrides.transactions || [])]),
    categories: mapWithUserId([...DEFAULT_DATA.categories, ...(overrides.categories || [])]),
    budgets: mapWithUserId([...DEFAULT_DATA.budgets, ...(overrides.budgets || [])])
  };
}

async function withApi(seedData, run) {
  const db = createMemoryDb(seedData);
  const { app } = await createApp({ db });
  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, db });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
}

async function jsonRequest(baseUrl, route, options = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: hasBody ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers,
    body: hasBody ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function loginAsUser(baseUrl) {
  const response = await jsonRequest(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: {
      email: 'user@mymoney.local',
      password: 'user12345'
    }
  });

  assert.equal(response.status, 200);
  return response.body.token;
}

test('POST /api/transactions rejects invalid category ids', async () => {
  await withApi(createSeedData(), async ({ baseUrl, db }) => {
    const token = await loginAsUser(baseUrl);
    const response = await jsonRequest(baseUrl, '/api/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        description: 'Tes invalid',
        amount: 1000,
        category_id: 999999
      }
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /does not exist/i);
    assert.equal((await db.getCollection('transactions')).length, 0);
  });
});

test('POST /api/auth/login returns a single user role and token for valid credentials', async () => {
  await withApi(createSeedData(), async ({ baseUrl }) => {
    const response = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'user@mymoney.local',
        password: 'user12345'
      }
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'user');
    assert.ok(response.body.token);
  });
});

test('GET /api/transactions requires authorization token', async () => {
  await withApi(createSeedData(), async ({ baseUrl }) => {
    const unauthorized = await jsonRequest(baseUrl, '/api/transactions');
    assert.equal(unauthorized.status, 401);

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'user@mymoney.local',
        password: 'user12345'
      }
    });

    const authorized = await jsonRequest(baseUrl, '/api/transactions', {
      headers: {
        authorization: `Bearer ${login.body.token}`
      }
    });

    assert.equal(authorized.status, 200);
    assert.ok(Array.isArray(authorized.body));
  });
});

test('POST /api/auth/register creates a new user with hashed password, initializes categories and returns a user session', async () => {
  await withApi(createSeedData({ users: [] }), async ({ baseUrl, db }) => {
    const register = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Alya',
        email: 'alya@example.com',
        password: 'rahasia123'
      }
    });

    assert.equal(register.status, 201);
    assert.equal(register.body.user.role, 'user');
    assert.ok(register.body.token);
    
    const userId = register.body.user.id;

    const storedUser = await db.findOne('users', { email: 'alya@example.com' });
    assert.ok(storedUser);
    assert.ok(storedUser.password_hash);
    assert.notEqual(storedUser.password_hash, 'rahasia123');
    
    const userCategories = await db.listCategories(userId);
    assert.equal(userCategories.length, 4); // should have 4 default categories
    assert.ok(userCategories.every(c => c.user_id === userId));

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'alya@example.com',
        password: 'rahasia123'
      }
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, 'alya@example.com');
  });
});

test('POST /api/transactions derives type from the selected category', async () => {
  await withApi(createSeedData(), async ({ baseUrl, db }) => {
    const token = await loginAsUser(baseUrl);
    const response = await jsonRequest(baseUrl, '/api/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        description: 'Salary without keyword',
        amount: 2500000,
        type: 'expense',
        category_id: 1
      }
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.type, 'income');
    assert.equal((await db.getCollection('transactions'))[0].type, 'income');
  });
});

test('DELETE /api/categories blocks categories that are still referenced', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 1001,
          description: 'Makan siang',
          amount: 30000,
          type: 'expense',
          category_id: 3,
          date: '10/04/2026',
          month: currentMonth,
          timestamp: 1001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/categories/3', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 409);
      assert.match(response.body.error, /cannot be deleted/i);
      assert.ok(await db.findOne('categories', { id: 3 }));
    }
  );
});

test('POST /api/budgets rejects income categories and over-allocation', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 2001,
          description: 'Gaji bulan ini',
          amount: 1000000,
          type: 'income',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 2001
        }
      ],
      budgets: [
        {
          id: 3001,
          category_id: 3,
          amount: 900000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 3001
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const wrongType = await jsonRequest(baseUrl, '/api/budgets', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          category_id: 1,
          amount: 100000
        }
      });

      assert.equal(wrongType.status, 400);
      assert.match(wrongType.body.error, /only expense or savings/i);

      const overBudget = await jsonRequest(baseUrl, '/api/budgets', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          category_id: 4,
          amount: 200000
        }
      });

      assert.equal(overBudget.status, 400);
      assert.match(overBudget.body.error, /exceeds current month income/i);
    }
  );
});

test('GET /api/summary classifies salary by category metadata instead of description', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 4001,
          description: 'Paycheck transfer',
          amount: 5000000,
          type: 'income',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 4001
        },
        {
          id: 4002,
          description: 'gaji side project',
          amount: 700000,
          type: 'income',
          category_id: 2,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 4002
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const authorizedResponse = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(authorizedResponse.status, 200);
      assert.equal(authorizedResponse.body.income_salary, 5000000);
      assert.equal(authorizedResponse.body.income_other, 700000);
      assert.equal(authorizedResponse.body.total_income_this_month, 5700000);
    }
  );
});

test('GET /api/summary does not reduce savings balance for savings deposits', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 5001,
          description: 'Gaji bulan ini',
          amount: 3000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 5001
        },
        {
          id: 5002,
          description: 'Setor tabungan',
          amount: 700000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 5002
        }
      ],
      budgets: [
        {
          id: 5101,
          category_id: 4,
          amount: 700000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 5101
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.savings_balance, 700000);
    }
  );
});

test('POST /api/transactions rejects expense transactions above remaining allocation', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 6001,
          description: 'Gaji bulan ini',
          amount: 2000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 6001
        },
        {
          id: 6002,
          description: 'Makan pertama',
          amount: 150000,
          type: 'expense',
          flow: 'out',
          category_id: 3,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 6002
        }
      ],
      budgets: [
        {
          id: 6101,
          category_id: 3,
          amount: 200000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 6101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Makan kedua',
          amount: 60000,
          category_id: 3
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi sisa alokasi/i);
      assert.equal((await db.getCollection('transactions')).length, 2);
    }
  );
});

test('POST /api/transactions allows savings transactions within allocated amount and stores inbound flow', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 7001,
          description: 'Gaji bulan ini',
          amount: 2500000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 7001
        }
      ],
      budgets: [
        {
          id: 7101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 7101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tabungan rutin',
          amount: 500000,
          category_id: 4
        }
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.type, 'savings');
      assert.equal(response.body.flow, 'in');
      assert.equal((await db.getCollection('transactions'))[1].flow, 'in');
    }
  );
});

test('POST /api/transactions allows savings withdrawals within available savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 8001,
          description: 'Setor tabungan awal',
          amount: 800000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 8001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik buat kebutuhan',
          amount: 300000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.type, 'savings');
      assert.equal(response.body.flow, 'out');
      assert.equal((await db.getCollection('transactions'))[1].flow, 'out');
    }
  );
});

test('POST /api/transactions rejects savings withdrawals above available savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 9001,
          description: 'Setor tabungan awal',
          amount: 150000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 9001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik terlalu besar',
          amount: 200000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi saldo tabungan/i);
      assert.equal((await db.getCollection('transactions')).length, 1);
    }
  );
});

test('GET /api/summary adds savings withdrawals back to active balance and reduces savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 10001,
          description: 'Gaji bulan ini',
          amount: 2000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 10001
        },
        {
          id: 10002,
          description: 'Setor tabungan',
          amount: 500000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 10002
        },
        {
          id: 10003,
          description: 'Tarik tabungan',
          amount: 200000,
          type: 'savings',
          flow: 'out',
          category_id: 4,
          date: '03/04/2026',
          month: currentMonth,
          timestamp: 10003
        }
      ],
      budgets: [
        {
          id: 10101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 10101
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.savings_balance, 300000);
      assert.equal(response.body.active_balance, 1700000);
    }
  );
});

test('PUT /api/transactions updates an existing savings transaction without breaking allocation checks', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 11001,
          description: 'Gaji bulan ini',
          amount: 2500000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 11001
        },
        {
          id: 11002,
          description: 'Setor tabungan awal',
          amount: 300000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 11002
        }
      ],
      budgets: [
        {
          id: 11101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 11101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions/11002', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Setor tabungan revisi',
          amount: 450000,
          category_id: 4,
          flow: 'in'
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.amount, 450000);
      assert.equal(response.body.description, 'Setor tabungan revisi');
      assert.equal((await db.findOne('transactions', { id: 11002 })).amount, 450000);
    }
  );
});

test('PUT /api/transactions rejects edited savings withdrawals above available balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 12001,
          description: 'Setor tabungan awal',
          amount: 300000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 12001
        },
        {
          id: 12002,
          description: 'Tarik kecil',
          amount: 50000,
          type: 'savings',
          flow: 'out',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 12002
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions/12002', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik terlalu besar',
          amount: 400000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi saldo tabungan/i);
      assert.equal((await db.findOne('transactions', { id: 12002 })).amount, 50000);
    }
  );
});

test('GET /api/admin/users requires admin role, non-admin gets 403', async () => {
  await withApi(
    createSeedData({
      users: [
        {
          id: 99,
          name: 'Admin User',
          email: 'admin@mymoney.local',
          password_hash: hashPassword('admin12345'),
          role: 'admin',
          status: 'active'
        }
      ]
    }),
    async ({ baseUrl }) => {
      const userToken = await loginAsUser(baseUrl);
      const adminToken = await jsonRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@mymoney.local', password: 'admin12345' }
      });
      
      // User request should return 403
      const resUser = await jsonRequest(baseUrl, '/api/admin/users', {
        headers: { authorization: `Bearer ${userToken}` }
      });
      assert.equal(resUser.status, 403);

      // Admin request should return 200
      const resAdmin = await jsonRequest(baseUrl, '/api/admin/users', {
        headers: { authorization: `Bearer ${adminToken.body.token}` }
      });
      assert.equal(resAdmin.status, 200);
      assert.ok(Array.isArray(resAdmin.body));
    }
  );
});

test('PATCH /api/admin/users/:id/status updates status and blocks login', async () => {
  await withApi(
    createSeedData({
      users: [
        {
          id: 99,
          name: 'Admin User',
          email: 'admin@mymoney.local',
          password_hash: hashPassword('admin12345'),
          role: 'admin',
          status: 'active'
        }
      ]
    }),
    async ({ baseUrl }) => {
      const adminToken = await jsonRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@mymoney.local', password: 'admin12345' }
      });

      // Suspend user (id: 1)
      const resUpdate = await jsonRequest(baseUrl, '/api/admin/users/1/status', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${adminToken.body.token}` },
        body: { status: 'suspended' }
      });
      assert.equal(resUpdate.status, 200);

      // Try login as suspended user
      const resLogin = await jsonRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'user@mymoney.local', password: 'user12345' }
      });
      assert.equal(resLogin.status, 401);
      assert.match(resLogin.body.error, /ditangguhkan/i);
    }
  );
});

test('GET /api/gamification evaluates automatic milestones and allows admin assignment', async () => {
  await withApi(
    createSeedData({
      users: [
        {
          id: 99,
          name: 'Admin User',
          email: 'admin@mymoney.local',
          password_hash: hashPassword('admin12345'),
          role: 'admin',
          status: 'active'
        }
      ],
      transactions: [
        {
          id: 13001,
          description: 'Tabungan bulanan',
          amount: 500000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: '2026-04',
          timestamp: 13001,
          user_id: 1
        },
        {
          id: 13002,
          description: 'Tabungan tambahan',
          amount: 600000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: '2026-04',
          timestamp: 13002,
          user_id: 1
        }
      ]
    }),
    async ({ baseUrl }) => {
      const userToken = await loginAsUser(baseUrl);
      const adminToken = await jsonRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@mymoney.local', password: 'admin12345' }
      });

      // Get progress for user (should automatically award "Si Rajin Nabung" because savings = 1,100,000 > 1,000,000)
      const resProg = await jsonRequest(baseUrl, '/api/gamification', {
        headers: { authorization: `Bearer ${userToken}` }
      });
      assert.equal(resProg.status, 200);
      
      const rajinNabung = resProg.body.find(m => m.id === 2);
      assert.equal(rajinNabung.progress, 1100000);
      assert.equal(rajinNabung.isCompleted, true);

      const manualBadge = resProg.body.find(m => m.id === 3);
      assert.equal(manualBadge.isCompleted, false);

      // Admin assigns manual badge (id: 3) to user (id: 1)
      const resAssign = await jsonRequest(baseUrl, '/api/admin/milestones/3/assign', {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken.body.token}` },
        body: { user_id: 1 }
      });
      assert.equal(resAssign.status, 200);

      // Get progress for user again (should be completed now)
      const resProg2 = await jsonRequest(baseUrl, '/api/gamification', {
        headers: { authorization: `Bearer ${userToken}` }
      });
      const manualBadge2 = resProg2.body.find(m => m.id === 3);
      assert.equal(manualBadge2.isCompleted, true);
    }
  );
});

test('POST /api/auth/register rejects duplicate email registration', async () => {
  await withApi(createSeedData(), async ({ baseUrl }) => {
    // Try to register with same email as 'user@mymoney.local' (which exists in seed)
    const response = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Duplicate User',
        email: 'user@mymoney.local',
        password: 'password123'
      }
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Email sudah digunakan.');
  });
});
