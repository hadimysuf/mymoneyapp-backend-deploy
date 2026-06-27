const { MongoClient } = require('mongodb');

const { DEFAULT_DATA } = require('../config/constants');
const { normalizeCategoryRecord } = require('../services/categoryService');
const { inferTransactionFlow } = require('../services/transactionService');
const { normalizeUserRecord } = require('../services/userService');
const { parseId } = require('../utils/common');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripMongoId(document) {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  return rest;
}

function createDocumentMatcher(query = {}) {
  return (document) =>
    Object.entries(query).every(([key, value]) => document[key] === value);
}

function normalizeBudgetRecord(budget, index) {
  return {
    ...budget,
    id: parseId(budget.id) ?? Date.now() + index,
    category_id: parseId(budget.category_id),
    amount: Number(budget.amount) || 0
  };
}

function normalizeTransactionRecord(transaction, index, categoryById) {
  const categoryId = parseId(transaction.category_id);
  return {
    ...transaction,
    id: parseId(transaction.id) ?? Date.now() + index,
    category_id: categoryId,
    amount: Number(transaction.amount) || 0,
    flow: inferTransactionFlow(transaction, categoryById.get(categoryId))
  };
}

function prepareSeedData(seedData = {}) {
  const baseData = {
    users: Array.isArray(seedData.users) ? seedData.users : DEFAULT_DATA.users,
    transactions: Array.isArray(seedData.transactions) ? seedData.transactions : DEFAULT_DATA.transactions,
    categories: Array.isArray(seedData.categories) ? seedData.categories : DEFAULT_DATA.categories,
    budgets: Array.isArray(seedData.budgets) ? seedData.budgets : DEFAULT_DATA.budgets,
    milestones: Array.isArray(seedData.milestones) ? seedData.milestones : DEFAULT_DATA.milestones,
    user_badges: Array.isArray(seedData.user_badges) ? seedData.user_badges : DEFAULT_DATA.user_badges
  };

  const normalizedUsers = baseData.users
    .map(normalizeUserRecord)
    .filter((user) => user.email && user.password_hash);

  const normalizedCategories = baseData.categories.map(normalizeCategoryRecord);
  const categoryById = new Map(normalizedCategories.map((category) => [category.id, category]));

  const normalizedBudgets = baseData.budgets.map(normalizeBudgetRecord);
  const normalizedTransactions = baseData.transactions.map((transaction, index) =>
    normalizeTransactionRecord(transaction, index, categoryById)
  );

  return {
    users: normalizedUsers,
    categories: normalizedCategories,
    budgets: normalizedBudgets,
    transactions: normalizedTransactions,
    milestones: clone(baseData.milestones),
    user_badges: clone(baseData.user_badges)
  };
}

// ---------------------------------------------------------------------------
// In-Memory DB (used for testing)
// ---------------------------------------------------------------------------

function createMemoryDb(seedData = {}) {
  const state = prepareSeedData(seedData);

  const getCollectionState = (collectionName) => {
    if (!Object.prototype.hasOwnProperty.call(state, collectionName)) {
      throw new Error(`Unknown collection: ${collectionName}`);
    }

    return state[collectionName];
  };

  return {
    /** Test helper — returns raw collection without user filtering. */
    async getCollection(collectionName) {
      return clone(getCollectionState(collectionName));
    },

    async findOne(collectionName, query) {
      const collection = getCollectionState(collectionName);
      const matcher = createDocumentMatcher(query);
      const document = collection.find(matcher);
      return document ? clone(document) : null;
    },

    // ---- Users ----
    async listUsers() {
      return this.getCollection('users');
    },

    async findUserByEmail(email) {
      return this.findOne('users', { email });
    },

    async createUser(user) {
      state.users.push(clone(user));
      return clone(user);
    },

    async updateUserStatus(userId, status) {
      const user = state.users.find((u) => u.id === userId);
      if (user) {
        user.status = status;
        return clone(user);
      }
      return null;
    },

    // ---- Categories (scoped per user) ----
    async listCategories(userId) {
      return clone(state.categories.filter((c) => c.user_id === userId));
    },

    async findCategoryById(userId, categoryId) {
      return this.findOne('categories', { id: categoryId, user_id: userId });
    },

    async createCategory(userId, category) {
      const record = clone({ ...category, user_id: userId });
      state.categories.push(record);
      return clone(record);
    },

    async deleteCategoryById(userId, categoryId) {
      const initialLength = state.categories.length;
      state.categories = state.categories.filter(
        (c) => !(c.id === categoryId && c.user_id === userId)
      );
      return state.categories.length !== initialLength;
    },

    // ---- Budgets (scoped per user) ----
    async listBudgets(userId) {
      return clone(state.budgets.filter((b) => b.user_id === userId));
    },

    async findBudgetByCategoryAndMonth(userId, categoryId, month) {
      return this.findOne('budgets', { category_id: categoryId, month, user_id: userId });
    },

    async upsertBudget(userId, budget) {
      const existingIndex = state.budgets.findIndex(
        (item) =>
          item.category_id === budget.category_id &&
          item.month === budget.month &&
          item.user_id === userId
      );

      const record = clone({ ...budget, user_id: userId });
      if (existingIndex >= 0) {
        state.budgets[existingIndex] = { ...state.budgets[existingIndex], ...record };
        return clone(state.budgets[existingIndex]);
      }

      state.budgets.push(record);
      return clone(record);
    },

    async deleteBudget(userId, categoryId, month) {
      const initialLength = state.budgets.length;
      state.budgets = state.budgets.filter(
        (b) => !(b.category_id === categoryId && b.month === month && b.user_id === userId)
      );
      return state.budgets.length !== initialLength;
    },

    // ---- Transactions (scoped per user) ----
    async listTransactions(userId) {
      return clone(state.transactions.filter((t) => t.user_id === userId));
    },

    async findTransactionById(userId, transactionId) {
      return this.findOne('transactions', { id: transactionId, user_id: userId });
    },

    async createTransaction(userId, transaction) {
      const record = clone({ ...transaction, user_id: userId });
      state.transactions.push(record);
      return clone(record);
    },

    async updateTransaction(userId, transactionId, updates) {
      const existingIndex = state.transactions.findIndex(
        (t) => t.id === transactionId && t.user_id === userId
      );
      if (existingIndex < 0) {
        return null;
      }

      state.transactions[existingIndex] = { ...state.transactions[existingIndex], ...clone(updates) };
      return clone(state.transactions[existingIndex]);
    },

    async deleteTransaction(userId, transactionId) {
      const initialLength = state.transactions.length;
      state.transactions = state.transactions.filter(
        (t) => !(t.id === transactionId && t.user_id === userId)
      );
      return state.transactions.length !== initialLength;
    },

    // ---- Init default categories for a newly registered user ----
    async initUserData(userId) {
      const existingCategories = state.categories.filter((c) => c.user_id === userId);
      if (existingCategories.length > 0) return;

      const defaultCats = prepareSeedData({ categories: DEFAULT_DATA.categories }).categories;
      defaultCats.forEach((cat, index) => {
        state.categories.push(clone({ ...cat, id: Date.now() + index, user_id: userId }));
      });
    },

    // ---- Milestones ----
    async listMilestones() {
      return clone(state.milestones);
    },
    async createMilestone(milestone) {
      const record = clone({ ...milestone, id: Date.now() });
      state.milestones.push(record);
      return clone(record);
    },
    async updateMilestone(milestoneId, updates) {
      const idx = state.milestones.findIndex(m => m.id === milestoneId);
      if (idx >= 0) {
        state.milestones[idx] = { ...state.milestones[idx], ...clone(updates) };
        return clone(state.milestones[idx]);
      }
      return null;
    },
    async deleteMilestone(milestoneId) {
      const len = state.milestones.length;
      state.milestones = state.milestones.filter(m => m.id !== milestoneId);
      return state.milestones.length !== len;
    },

    // ---- User Badges ----
    async listUserBadges(userId) {
      return clone(state.user_badges.filter(b => b.user_id === userId));
    },
    async assignUserBadge(userId, badgeId) {
      const record = { user_id: userId, milestone_id: badgeId, earned_at: Date.now() };
      state.user_badges.push(record);
      return clone(record);
    },

    async syncSeedData(seedDataToSync) {
      const normalizedData = prepareSeedData(seedDataToSync);
      state.users = normalizedData.users;
      state.categories = normalizedData.categories;
      state.budgets = normalizedData.budgets;
      state.transactions = normalizedData.transactions;
      state.milestones = normalizedData.milestones;
      state.user_badges = normalizedData.user_badges;
    },

    async close() {}
  };
}

// ---------------------------------------------------------------------------
// MongoDB helpers
// ---------------------------------------------------------------------------

function resolveDbName(uri, explicitDbName) {
  if (explicitDbName) {
    return explicitDbName;
  }

  try {
    const parsedUri = new URL(uri);
    const pathname = parsedUri.pathname.replace(/^\/+/, '');
    return pathname || 'mymoneyapp';
  } catch {
    return 'mymoneyapp';
  }
}

async function ensureIndexes(database) {
  // Migration: drop old single-field unique indexes (pre-multi-user) if they exist.
  await Promise.all([
    database.collection('categories').dropIndex({ id: 1 }).catch(() => {}),
    database.collection('transactions').dropIndex({ id: 1 }).catch(() => {}),
    database.collection('budgets').dropIndex({ id: 1 }).catch(() => {}),
    database.collection('budgets').dropIndex({ category_id: 1, month: 1 }).catch(() => {})
  ]);

  // Create new compound indexes that include user_id for per-user data isolation.
  await Promise.all([
    database.collection('users').createIndex({ id: 1 }, { unique: true }),
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('categories').createIndex({ id: 1, user_id: 1 }, { unique: true }),
    database.collection('transactions').createIndex({ id: 1, user_id: 1 }, { unique: true }),
    database.collection('budgets').createIndex({ id: 1, user_id: 1 }, { unique: true }),
    database.collection('budgets').createIndex(
      { category_id: 1, month: 1, user_id: 1 },
      { unique: true }
    ),
    database.collection('milestones').createIndex({ id: 1 }, { unique: true }),
    database.collection('user_badges').createIndex({ user_id: 1, milestone_id: 1 }, { unique: true })
  ]);
}

async function upsertCollection(collection, documents, key = 'id') {
  if (!documents.length) {
    return;
  }

  await collection.bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { [key]: document[key] },
        replacement: document,
        upsert: true
      }
    }))
  );
}

// ---------------------------------------------------------------------------
// MongoDB DB (used in production)
// ---------------------------------------------------------------------------

async function createMongoDb({ mongoUri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB_NAME } = {}) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI belum di-set. Isi connection string MongoDB Atlas sebelum menjalankan backend.');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  const database = client.db(resolveDbName(mongoUri, dbName));
  await ensureIndexes(database);

  return {
    /** Utility helper — returns raw collection without user filtering. */
    async getCollection(collectionName) {
      return database
        .collection(collectionName)
        .find({}, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
    },

    async findOne(collectionName, query) {
      const document = await database
        .collection(collectionName)
        .findOne(query, { projection: { _id: 0 } });
      return stripMongoId(document);
    },

    // ---- Users ----
    async listUsers() {
      return this.getCollection('users');
    },

    async findUserByEmail(email) {
      return this.findOne('users', { email });
    },

    async createUser(user) {
      await database.collection('users').insertOne(user);
      return clone(user);
    },

    async updateUserStatus(userId, status) {
      const updated = await database.collection('users').findOneAndUpdate(
        { id: userId },
        { $set: { status } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      return stripMongoId(updated);
    },

    // ---- Categories (scoped per user) ----
    async listCategories(userId) {
      return database
        .collection('categories')
        .find({ user_id: userId }, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
    },

    async findCategoryById(userId, categoryId) {
      return this.findOne('categories', { id: categoryId, user_id: userId });
    },

    async createCategory(userId, category) {
      const record = { ...category, user_id: userId };
      await database.collection('categories').insertOne(record);
      return clone(category);
    },

    async deleteCategoryById(userId, categoryId) {
      const result = await database
        .collection('categories')
        .deleteOne({ id: categoryId, user_id: userId });
      return result.deletedCount > 0;
    },

    // ---- Budgets (scoped per user) ----
    async listBudgets(userId) {
      return database
        .collection('budgets')
        .find({ user_id: userId }, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
    },

    async findBudgetByCategoryAndMonth(userId, categoryId, month) {
      return this.findOne('budgets', { category_id: categoryId, month, user_id: userId });
    },

    async upsertBudget(userId, budget) {
      const record = { ...budget, user_id: userId };
      await database.collection('budgets').updateOne(
        { category_id: budget.category_id, month: budget.month, user_id: userId },
        { $set: record },
        { upsert: true }
      );
      return this.findBudgetByCategoryAndMonth(userId, budget.category_id, budget.month);
    },

    async deleteBudget(userId, categoryId, month) {
      const result = await database
        .collection('budgets')
        .deleteOne({ category_id: categoryId, month, user_id: userId });
      return result.deletedCount > 0;
    },

    // ---- Transactions (scoped per user) ----
    async listTransactions(userId) {
      return database
        .collection('transactions')
        .find({ user_id: userId }, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
    },

    async findTransactionById(userId, transactionId) {
      return this.findOne('transactions', { id: transactionId, user_id: userId });
    },

    async createTransaction(userId, transaction) {
      const record = { ...transaction, user_id: userId };
      await database.collection('transactions').insertOne(record);
      return clone(transaction);
    },

    async updateTransaction(userId, transactionId, updates) {
      const updatedTransaction = await database
        .collection('transactions')
        .findOneAndUpdate(
          { id: transactionId, user_id: userId },
          { $set: updates },
          { projection: { _id: 0 }, returnDocument: 'after' }
        );
      return stripMongoId(updatedTransaction);
    },

    async deleteTransaction(userId, transactionId) {
      const result = await database
        .collection('transactions')
        .deleteOne({ id: transactionId, user_id: userId });
      return result.deletedCount > 0;
    },

    // ---- Init default categories for a newly registered user ----
    async initUserData(userId) {
      const categoriesCollection = database.collection('categories');
      const existingCount = await categoriesCollection.countDocuments({ user_id: userId });
      if (existingCount > 0) return;

      const defaultCats = prepareSeedData({ categories: DEFAULT_DATA.categories }).categories;
      const userCats = defaultCats.map((cat, index) => ({
        ...cat,
        id: Date.now() + index,
        user_id: userId
      }));

      if (userCats.length > 0) {
        await categoriesCollection.insertMany(userCats);
      }
    },

    // ---- Milestones ----
    async listMilestones() {
      return database.collection('milestones').find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
    },
    async createMilestone(milestone) {
      const record = { ...milestone, id: Date.now() };
      await database.collection('milestones').insertOne(record);
      return clone(record);
    },
    async updateMilestone(milestoneId, updates) {
      const updated = await database.collection('milestones').findOneAndUpdate(
        { id: milestoneId },
        { $set: updates },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      return stripMongoId(updated);
    },
    async deleteMilestone(milestoneId) {
      const res = await database.collection('milestones').deleteOne({ id: milestoneId });
      return res.deletedCount > 0;
    },

    // ---- User Badges ----
    async listUserBadges(userId) {
      return database.collection('user_badges').find({ user_id: userId }, { projection: { _id: 0 } }).toArray();
    },
    async assignUserBadge(userId, badgeId) {
      const record = { user_id: userId, milestone_id: badgeId, earned_at: Date.now() };
      await database.collection('user_badges').updateOne(
        { user_id: userId, milestone_id: badgeId },
        { $set: record },
        { upsert: true }
      );
      return record;
    },

    async syncSeedData(seedData) {
      const normalizedData = prepareSeedData(seedData);
      await Promise.all([
        upsertCollection(database.collection('users'), normalizedData.users),
        upsertCollection(database.collection('categories'), normalizedData.categories),
        upsertCollection(database.collection('budgets'), normalizedData.budgets),
        upsertCollection(database.collection('transactions'), normalizedData.transactions),
        upsertCollection(database.collection('milestones'), normalizedData.milestones),
        upsertCollection(database.collection('user_badges'), normalizedData.user_badges, 'milestone_id')
      ]);
    },

    async close() {
      await client.close();
    }
  };
}

module.exports = {
  createMemoryDb,
  createMongoDb,
  prepareSeedData
};
