const { SAVINGS_OUTFLOW_KEYWORDS } = require('../config/constants');
const { getCategoryById } = require('./categoryService');
const {
  formatLocalDate,
  getCurrentMonth,
  normalizeString,
  parseId,
  parsePositiveAmount
} = require('../utils/common');

function inferTransactionFlow(transaction, category) {
  if (category?.type === 'savings' || transaction?.type === 'savings') {
    if (transaction?.flow === 'in' || transaction?.flow === 'out') {
      return transaction.flow;
    }

    return SAVINGS_OUTFLOW_KEYWORDS.test(normalizeString(transaction?.description)) ? 'out' : 'in';
  }

  if (category?.type === 'income' || transaction?.type === 'income') {
    return 'in';
  }

  return 'out';
}

async function getFilteredTransactions(db, userId, excludedTransactionId = null) {
  const transactions = await db.listTransactions(userId);
  if (excludedTransactionId === null) {
    return transactions;
  }

  return transactions.filter((transaction) => transaction.id !== excludedTransactionId);
}

async function validateTransactionPayload(db, userId, body, options = {}) {
  const existingTransaction = options.existingTransaction || null;
  const description = normalizeString(body?.description);
  const amount = parsePositiveAmount(body?.amount);
  const categoryId = parseId(body?.category_id);

  if (!description) {
    return { error: 'Transaction description is required.' };
  }

  if (!amount) {
    return { error: 'Transaction amount must be a positive number.' };
  }

  if (categoryId === null) {
    return { error: 'Transaction category_id is invalid.' };
  }

  const category = await getCategoryById(db, userId, categoryId);
  if (!category) {
    return { error: 'Transaction category does not exist.' };
  }

  const now = new Date();
  const targetMonth = existingTransaction?.month || getCurrentMonth(now);
  const requestedFlow = normalizeString(body?.flow);
  let flow = inferTransactionFlow({ flow: requestedFlow, description }, category);
  const [candidateTransactions, budgets] = await Promise.all([
    getFilteredTransactions(db, userId, existingTransaction?.id ?? null),
    db.listBudgets(userId)
  ]);

  if (category.type !== 'savings') {
    flow = inferTransactionFlow({}, category);
  }

  if (category.type === 'expense') {
    const currentBudget = budgets.find(
      (budget) => budget.category_id === categoryId && budget.month === targetMonth
    );

    if (!currentBudget) {
      return { error: 'Kategori ini belum punya alokasi untuk bulan berjalan.' };
    }

    const usedAmount = candidateTransactions
      .filter((transaction) => transaction.category_id === categoryId && transaction.month === targetMonth)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const remainingAmount = currentBudget.amount - usedAmount;
    if (amount > remainingAmount) {
      return {
        error: `Transaksi melebihi sisa alokasi kategori ini. Sisa yang tersedia: ${Math.max(remainingAmount, 0)}.`
      };
    }
  }

  if (category.type === 'savings' && flow === 'in') {
    const currentBudget = budgets.find(
      (budget) => budget.category_id === categoryId && budget.month === targetMonth
    );

    if (!currentBudget) {
      return { error: 'Kategori tabungan ini belum punya alokasi untuk bulan berjalan.' };
    }

    const usedAmount = candidateTransactions
      .filter(
        (transaction) =>
          transaction.category_id === categoryId &&
          transaction.month === targetMonth &&
          inferTransactionFlow(transaction, category) === 'in'
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const remainingAmount = currentBudget.amount - usedAmount;
    if (amount > remainingAmount) {
      return {
        error: `Setoran melebihi sisa alokasi tabungan ini. Sisa yang tersedia: ${Math.max(remainingAmount, 0)}.`
      };
    }
  }

  if (category.type === 'savings' && flow === 'out') {
    const availableSavings = candidateTransactions
      .filter((transaction) => transaction.category_id === categoryId)
      .reduce((sum, transaction) => {
        const transactionFlow = inferTransactionFlow(transaction, category);
        return sum + (transactionFlow === 'in' ? transaction.amount : -transaction.amount);
      }, 0);

    if (amount > availableSavings) {
      return {
        error: `Penarikan melebihi saldo tabungan kategori ini. Saldo tersedia: ${Math.max(availableSavings, 0)}.`
      };
    }
  }

  return {
    value: {
      id: Date.now(),
      description,
      amount,
      type: category.type,
      flow,
      category_id: categoryId,
      date: existingTransaction?.date || formatLocalDate(now),
      month: targetMonth,
      timestamp: existingTransaction?.timestamp || now.getTime()
    }
  };
}

module.exports = {
  getFilteredTransactions,
  inferTransactionFlow,
  validateTransactionPayload
};
