const { hashPassword, verifyPassword } = require('../utils/password');
const { normalizeEmail, normalizeString, parseId } = require('../utils/common');

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    status: user.status || 'active'
  };
}

function buildAuthPayload(user, token) {
  return {
    token,
    user: sanitizeUser(user)
  };
}

function normalizeUserRecord(user) {
  const normalizedEmail = normalizeEmail(user.email);
  const rawPasswordHash = normalizeString(user.password_hash || user.passwordHash);
  const legacyPassword = normalizeString(user.password);

  return {
    id: parseId(user.id) ?? Date.now(),
    name: normalizeString(user.name) || 'User MyMoney',
    email: normalizedEmail,
    password_hash: rawPasswordHash || (legacyPassword ? hashPassword(legacyPassword) : ''),
    role: user.role || 'user',
    status: user.status || 'active'
  };
}

async function getUserByEmail(db, email) {
  return db.findUserByEmail(normalizeEmail(email));
}

async function validateRegisterPayload(db, body) {
  const name = normalizeString(body?.name);
  const email = normalizeEmail(body?.email);
  const password = normalizeString(body?.password);

  if (!name) {
    return { error: 'Nama user wajib diisi.' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Email tidak valid.' };
  }

  if (password.length < 8) {
    return { error: 'Password minimal 8 karakter.' };
  }

  if (await getUserByEmail(db, email)) {
    return { error: 'Email sudah digunakan.' };
  }

  return {
    value: {
      id: Date.now(),
      name,
      email,
      password_hash: hashPassword(password),
      role: 'user',
      status: 'active'
    }
  };
}

async function validateLoginCredentials(db, body) {
  const email = normalizeEmail(body?.email);
  const password = normalizeString(body?.password);
  const user = await getUserByEmail(db, email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: 'Email atau password salah.' };
  }

  if (user.status === 'suspended') {
    return { error: 'Akun ini telah ditangguhkan.' };
  }

  return { value: user };
}

module.exports = {
  buildAuthPayload,
  getUserByEmail,
  normalizeUserRecord,
  sanitizeUser,
  validateLoginCredentials,
  validateRegisterPayload
};
