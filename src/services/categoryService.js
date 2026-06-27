const { CATEGORY_TYPES, INCOME_GROUPS } = require('../config/constants');
const { inferIncomeGroup } = require('./incomeService');
const { normalizeString, parseId } = require('../utils/common');

function normalizeCategoryRecord(category) {
  const normalized = {
    ...category,
    id: parseId(category.id) ?? Date.now(),
    name: typeof category.name === 'string' ? category.name : '',
    type: category.type
  };

  if (normalized.type === 'income') {
    normalized.group = INCOME_GROUPS.has(category.group)
      ? category.group
      : inferIncomeGroup(normalized.name);
  } else {
    delete normalized.group;
  }

  return normalized;
}

async function getCategoryById(db, userId, categoryId) {
  return db.findCategoryById(userId, categoryId);
}

function buildCategoryPayload(body) {
  const name = normalizeString(body?.name);
  const type = normalizeString(body?.type);

  if (!name) {
    return { error: 'Category name is required.' };
  }

  if (!CATEGORY_TYPES.has(type)) {
    return { error: 'Category type must be income, expense, or savings.' };
  }

  const payload = {
    id: Date.now(),
    name,
    type
  };

  if (type === 'income') {
    const requestedGroup = normalizeString(body?.group);
    payload.group = INCOME_GROUPS.has(requestedGroup)
      ? requestedGroup
      : inferIncomeGroup(name);
  }

  return { value: payload };
}

async function hasDuplicateCategoryName(db, userId, payload) {
  const categories = await db.listCategories(userId);
  return categories.some(
    (category) =>
      category.type === payload.type &&
      normalizeString(category.name).toLowerCase() === payload.name.toLowerCase()
  );
}

async function isCategoryReferenced(db, userId, categoryId) {
  const [transactions, budgets] = await Promise.all([
    db.listTransactions(userId),
    db.listBudgets(userId)
  ]);

  const isUsedInTransactions = transactions.some(
    (transaction) => transaction.category_id === categoryId
  );
  const isUsedInBudgets = budgets.some(
    (budget) => budget.category_id === categoryId
  );

  return isUsedInTransactions || isUsedInBudgets;
}

module.exports = {
  buildCategoryPayload,
  getCategoryById,
  hasDuplicateCategoryName,
  isCategoryReferenced,
  normalizeCategoryRecord
};
