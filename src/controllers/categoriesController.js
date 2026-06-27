const {
  buildCategoryPayload,
  getCategoryById,
  hasDuplicateCategoryName,
  isCategoryReferenced
} = require('../services/categoryService');
const { jsonError, parseId } = require('../utils/common');

function createCategoriesController({ db }) {
  return {
    async list(req, res) {
      return res.json(await db.listCategories(req.userId));
    },

    async create(req, res) {
      const result = buildCategoryPayload(req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      if (await hasDuplicateCategoryName(db, req.userId, result.value)) {
        return jsonError(res, 409, 'Category name already exists for this type.');
      }

      await db.createCategory(req.userId, result.value);
      return res.status(201).json(result.value);
    },

    async remove(req, res) {
      const categoryId = parseId(req.params.id);
      if (categoryId === null) {
        return jsonError(res, 400, 'Category id is invalid.');
      }

      const existing = await getCategoryById(db, req.userId, categoryId);
      if (!existing) {
        return jsonError(res, 404, 'Category not found.');
      }

      if (await isCategoryReferenced(db, req.userId, categoryId)) {
        return jsonError(res, 409, 'Category cannot be deleted because it is still referenced by transactions or budgets.');
      }

      await db.deleteCategoryById(req.userId, categoryId);
      return res.json({ message: 'Deleted' });
    }
  };
}

module.exports = {
  createCategoriesController
};
