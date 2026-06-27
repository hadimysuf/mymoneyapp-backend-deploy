const jwt = require('jsonwebtoken');

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET belum di-set untuk production.');
  }

  return 'local-dev-secret';
}

function createAuthToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: (user.role || 'user').toLowerCase()
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = {
  createAuthToken,
  verifyAuthToken
};
