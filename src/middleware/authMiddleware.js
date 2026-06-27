const { jsonError } = require('../utils/common');
const { verifyAuthToken } = require('../utils/token');

function createAuthMiddleware(db) {
  return async (req, res, next) => {
    const authHeader = req.get('authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return jsonError(res, 401, 'Unauthorized.');
    }

    try {
      const payload = verifyAuthToken(token);
      const userId = Number.parseInt(payload.sub, 10);

      if (db) {
        const users = await db.listUsers();
        const user = users.find((u) => u.id === userId);
        if (user && user.status === 'suspended') {
          return jsonError(res, 401, 'Akun ini telah ditangguhkan.');
        }
      }

      req.userId = userId;
      req.userRole = payload.role;
      return next();
    } catch {
      return jsonError(res, 401, 'Unauthorized.');
    }
  };
}

function createAdminMiddleware() {
  return (req, res, next) => {
    if (req.userRole !== 'admin') {
      return jsonError(res, 403, 'Forbidden. Admin role required.');
    }
    return next();
  };
}

module.exports = {
  createAuthMiddleware,
  createAdminMiddleware
};
