const express = require('express');

function createGamificationRouter(controller) {
  const router = express.Router();
  router.get('/', controller.getProgress);
  return router;
}

module.exports = { createGamificationRouter };
