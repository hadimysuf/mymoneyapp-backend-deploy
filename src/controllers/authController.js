const { buildAuthPayload, validateLoginCredentials, validateRegisterPayload } = require('../services/userService');
const { createAuthToken } = require('../utils/token');
const { jsonError } = require('../utils/common');

function createAuthController({ db }) {
  return {
    async register(req, res) {
      const result = await validateRegisterPayload(db, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      await db.createUser(result.value);
      // Salin kategori default saat pertama register
      await db.initUserData(result.value.id);
      
      return res.status(201).json(buildAuthPayload(result.value, createAuthToken(result.value)));
    },

    async login(req, res) {
      const result = await validateLoginCredentials(db, req.body);
      if (result.error) {
        return jsonError(res, 401, result.error);
      }

      // Pastikan pengguna lama yang belum punya kategori otomatis diinisialisasi
      await db.initUserData(result.value.id);

      return res.json(buildAuthPayload(result.value, createAuthToken(result.value)));
    }
  };
}

module.exports = {
  createAuthController
};
