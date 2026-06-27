const { getCurrentMonth } = require('../utils/common');
const { normalizeCategoryRecord } = require('./categoryService');
const { getIncomeGroup } = require('./incomeService');
const { inferTransactionFlow } = require('./transactionService');

async function calculateSummary(db, userId) {
  const [transactions, budgets, categories] = await Promise.all([
    db.listTransactions(userId),
    db.listBudgets(userId),
    db.listCategories(userId)
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, normalizeCategoryRecord(category)]));
  const currentMonth = getCurrentMonth();
  const todayDate = new Date().getDate();

  const transactionsThisMonth = transactions.filter((transaction) => transaction.month === currentMonth);
  const transactionsPastMonths = transactions.filter((transaction) => transaction.month < currentMonth);
  const budgetsThisMonth = budgets.filter((budget) => budget.month === currentMonth);
  const budgetsPastMonths = budgets.filter((budget) => budget.month < currentMonth);

  const savingsCategoryIds = categories
    .filter((category) => category.type === 'savings')
    .map((category) => category.id);

  const incomeSalary = transactionsThisMonth
    .filter((transaction) => transaction.type === 'income')
    .filter((transaction) => getIncomeGroup(categoryById.get(transaction.category_id)) === 'salary')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const incomeOther = transactionsThisMonth
    .filter((transaction) => transaction.type === 'income')
    .filter((transaction) => getIncomeGroup(categoryById.get(transaction.category_id)) !== 'salary')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalIncomeThisMonth = incomeSalary + incomeOther;
  const totalAllocatedThisMonth = budgetsThisMonth.reduce((sum, budget) => sum + budget.amount, 0);
  const unallocatedThisMonth = totalIncomeThisMonth - totalAllocatedThisMonth;
  const expenseThisMonth = transactionsThisMonth
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const savingsWithdrawalsThisMonth = transactionsThisMonth
    .filter(
      (transaction) =>
        transaction.type === 'savings' &&
        inferTransactionFlow(transaction, categoryById.get(transaction.category_id)) === 'out'
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const activeBalance = totalIncomeThisMonth - totalAllocatedThisMonth - expenseThisMonth + savingsWithdrawalsThisMonth;

  const totalIncomePast = transactionsPastMonths
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpensePast = transactionsPastMonths
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalAllocatedPast = budgetsPastMonths.reduce((sum, budget) => sum + budget.amount, 0);
  const savingsAllocatedPast = budgetsPastMonths
    .filter((budget) => savingsCategoryIds.includes(budget.category_id))
    .reduce((sum, budget) => sum + budget.amount, 0);
  const expenseAllocatedPast = totalAllocatedPast - savingsAllocatedPast;

  const unallocatedPast = totalIncomePast - totalAllocatedPast;
  const unspentPast = expenseAllocatedPast - totalExpensePast;
  const leftoverPastMonth = unallocatedPast + unspentPast;

  let leftoverPercentage = 0;
  if (totalIncomePast > 0) {
    leftoverPercentage = Number(((leftoverPastMonth / totalIncomePast) * 100).toFixed(1));
  }

  const totalSavingsIn = transactions
    .filter(
      (transaction) =>
        transaction.type === 'savings' &&
        inferTransactionFlow(transaction, categoryById.get(transaction.category_id)) === 'in'
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalSavingsOut = transactions
    .filter(
      (transaction) =>
        transaction.type === 'savings' &&
        inferTransactionFlow(transaction, categoryById.get(transaction.category_id)) === 'out'
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const savingsBalance = totalSavingsIn - totalSavingsOut;

  return {
    current_month: currentMonth,
    is_end_of_month: todayDate >= 25,
    income_salary: incomeSalary,
    income_other: incomeOther,
    total_income_this_month: totalIncomeThisMonth,
    unallocated_this_month: unallocatedThisMonth,
    active_balance: activeBalance,
    leftover_past_month: leftoverPastMonth,
    leftover_percentage: leftoverPercentage,
    unallocated_past: unallocatedPast,
    unspent_past: unspentPast,
    savings_balance: savingsBalance
  };
}

module.exports = {
  calculateSummary
};
