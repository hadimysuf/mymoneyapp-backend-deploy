const express = require('express');

function createAdminRouter(controller) {
  const router = express.Router();
  router.get('/users', controller.listUsers);
  router.patch('/users/:id/status', controller.updateStatus);
  router.get('/users/:id/transactions', controller.getUserTransactions);
  router.get('/users/:id/summary', controller.getUserSummary);
  router.get('/milestones', controller.listMilestones);
  router.post('/milestones', controller.createMilestone);
  router.put('/milestones/:id', controller.updateMilestone);
  router.delete('/milestones/:id', controller.deleteMilestone);
  router.post('/milestones/:id/assign', controller.assignMilestone);
  return router;
}

module.exports = { createAdminRouter };
