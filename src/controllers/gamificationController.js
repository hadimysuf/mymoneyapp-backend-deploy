function createGamificationController({ db }) {
  return {
    async getProgress(req, res) {
      const userId = req.userId;
      const [milestones, userBadges, transactions] = await Promise.all([
        db.listMilestones(),
        db.listUserBadges(userId),
        db.listTransactions(userId)
      ]);

      const earnedSet = new Set(userBadges.map((b) => b.milestone_id));
      const results = [];

      for (const m of milestones) {
        let progress = 0;
        let isCompleted = earnedSet.has(m.id);
        
        if (m.condition === 'transaction_count') {
          progress = transactions.length;
        } else if (m.condition === 'savings_amount') {
          progress = transactions
            .filter(t => t.type === 'savings')
            .reduce((sum, t) => sum + t.amount, 0);
        }

        if (!isCompleted && m.target > 0 && progress >= m.target) {
          // Auto-award if threshold met
          await db.assignUserBadge(userId, m.id);
          isCompleted = true;
        }

        results.push({
          ...m,
          progress,
          isCompleted
        });
      }

      return res.json(results);
    }
  };
}

module.exports = { createGamificationController };
