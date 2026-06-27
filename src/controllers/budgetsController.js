const { validateBudgetPayload } = require('../services/budgetService');
const { getCurrentMonth, jsonError, parseId } = require('../utils/common');

function createBudgetsController({ db }) {
  return {
    async list(req, res) {
      return res.json(await db.listBudgets(req.userId));
    },

    async create(req, res) {
      const result = await validateBudgetPayload(db, req.userId, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      const existingBudget = await db.findBudgetByCategoryAndMonth(
        req.userId,
        result.value.categoryId,
        result.value.currentMonth
      );

      await db.upsertBudget(req.userId, {
        id: existingBudget?.id || result.value.timestamp,
        category_id: result.value.categoryId,
        amount: result.value.amount,
        month: result.value.currentMonth,
        timestamp: result.value.timestamp,
        date: result.value.date
      });

      return res.json({ message: 'Budget set for this month' });
    },

    async remove(req, res) {
      const categoryId = parseId(req.params.id);
      if (categoryId === null) {
        return jsonError(res, 400, 'Budget category id is invalid.');
      }

      const currentMonth = getCurrentMonth();
      const existingBudget = await db.findBudgetByCategoryAndMonth(req.userId, categoryId, currentMonth);
      if (!existingBudget) {
        return jsonError(res, 404, 'Budget for the current month was not found.');
      }

      await db.deleteBudget(req.userId, categoryId, currentMonth);
      return res.json({ message: 'Budget deleted for this month' });
    }
  };
}

module.exports = {
  createBudgetsController
};
