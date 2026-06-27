const express = require('express');
const cors = require('cors');

const { CATEGORY_TYPES, DEFAULT_DATA } = require('./src/config/constants');
const { createMemoryDb, createMongoDb } = require('./src/data/db');
const { createAuthMiddleware, createAdminMiddleware } = require('./src/middleware/authMiddleware');
const { createAuthController } = require('./src/controllers/authController');
const { createBudgetsController } = require('./src/controllers/budgetsController');
const { createCategoriesController } = require('./src/controllers/categoriesController');
const { createSummaryController } = require('./src/controllers/summaryController');
const { createTransactionsController } = require('./src/controllers/transactionsController');
const { createAdminController } = require('./src/controllers/adminController');
const { createGamificationController } = require('./src/controllers/gamificationController');
const { createAuthRouter } = require('./src/routes/authRoutes');
const { createBudgetsRouter } = require('./src/routes/budgetsRoutes');
const { createCategoriesRouter } = require('./src/routes/categoriesRoutes');
const { createSummaryRouter } = require('./src/routes/summaryRoutes');
const { createTransactionsRouter } = require('./src/routes/transactionsRoutes');
const { createAdminRouter } = require('./src/routes/adminRoutes');
const { createGamificationRouter } = require('./src/routes/gamificationRoutes');
const { inferIncomeGroup } = require('./src/services/incomeService');
const { calculateSummary } = require('./src/services/summaryService');
const { inferTransactionFlow } = require('./src/services/transactionService');
const { hashPassword, verifyPassword } = require('./src/utils/password');
const { parseId, parsePositiveAmount } = require('./src/utils/common');

async function createApp(options = {}) {
  const db = options.db || await createMongoDb(options);
  const app = express();

  const authController = createAuthController({ db });
  const transactionsController = createTransactionsController({ db });
  const categoriesController = createCategoriesController({ db });
  const budgetsController = createBudgetsController({ db });
  const summaryController = createSummaryController({ db });
  const adminController = createAdminController({ db });
  const gamificationController = createGamificationController({ db });

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', createAuthRouter(authController));
  
  const authMiddleware = createAuthMiddleware(db);
  const adminMiddleware = createAdminMiddleware();

  app.use('/api', authMiddleware);
  app.use('/api/transactions', createTransactionsRouter(transactionsController));
  app.use('/api/categories', createCategoriesRouter(categoriesController));
  app.use('/api/budgets', createBudgetsRouter(budgetsController));
  app.use('/api', createSummaryRouter(summaryController));
  
  app.use('/api/admin', adminMiddleware, createAdminRouter(adminController));
  app.use('/api/gamification', createGamificationRouter(gamificationController));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return { app, db };
}

module.exports = {
  CATEGORY_TYPES,
  DEFAULT_DATA,
  calculateSummary,
  createApp,
  createMemoryDb,
  createMongoDb,
  hashPassword,
  inferIncomeGroup,
  inferTransactionFlow,
  parseId,
  parsePositiveAmount,
  verifyPassword
};
