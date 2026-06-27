const { calculateSummary } = require('../services/summaryService');

function createSummaryController({ db }) {
  return {
    async show(req, res) {
      return res.json(await calculateSummary(db, req.userId));
    }
  };
}

module.exports = {
  createSummaryController
};
