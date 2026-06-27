const { getCategoryById } = require('./categoryService');
const { getCurrentMonth, formatLocalDate, parseId, parsePositiveAmount } = require('../utils/common');

async function getCurrentMonthIncome(db, userId, currentMonth) {
  const transactions = await db.listTransactions(userId);
  return transactions
    .filter((transaction) => transaction.month === currentMonth && transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

async function validateBudgetPayload(db, userId, body) {
  const categoryId = parseId(body?.category_id);
  const amount = parsePositiveAmount(body?.amount);

  if (categoryId === null) {
    return { error: 'Budget category_id is invalid.' };
  }

  if (!amount) {
    return { error: 'Budget amount must be a positive number.' };
  }

  const category = await getCategoryById(db, userId, categoryId);
  if (!category) {
    return { error: 'Budget category does not exist.' };
  }

  if (!['expense', 'savings'].includes(category.type)) {
    return { error: 'Only expense or savings categories can be budgeted.' };
  }

  const now = new Date();
  const currentMonth = getCurrentMonth(now);
  const [budgets, totalIncomeThisMonth] = await Promise.all([
    db.listBudgets(userId),
    getCurrentMonthIncome(db, userId, currentMonth)
  ]);
  const currentMonthAllocatedExcludingTarget = budgets
    .filter((budget) => budget.month === currentMonth && budget.category_id !== categoryId)
    .reduce((sum, budget) => sum + budget.amount, 0);

  if (currentMonthAllocatedExcludingTarget + amount > totalIncomeThisMonth) {
    return {
      error: `Budget allocation exceeds current month income. Remaining allocatable amount is ${Math.max(totalIncomeThisMonth - currentMonthAllocatedExcludingTarget, 0)}.`
    };
  }

  return {
    value: {
      categoryId,
      amount,
      currentMonth,
      timestamp: now.getTime(),
      date: formatLocalDate(now)
    }
  };
}

module.exports = {
  getCurrentMonthIncome,
  validateBudgetPayload
};
