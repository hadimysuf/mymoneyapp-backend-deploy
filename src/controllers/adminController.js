const { jsonError, parseId } = require('../utils/common');
const { sanitizeUser } = require('../services/userService');
const { calculateSummary } = require('../services/summaryService');

function createAdminController({ db }) {
  return {
    async listUsers(req, res) {
      const users = await db.listUsers();
      // Only return non-sensitive fields
      return res.json(users.map(u => ({ ...sanitizeUser(u), status: u.status })));
    },
    async updateStatus(req, res) {
      const userId = parseId(req.params.id);
      const { status } = req.body;
      if (!['active', 'suspended'].includes(status)) {
        return jsonError(res, 400, 'Invalid status.');
      }
      const updatedUser = await db.updateUserStatus(userId, status);
      if (!updatedUser) return jsonError(res, 404, 'User not found.');
      return res.json({ message: 'Status updated', user: { ...sanitizeUser(updatedUser), status: updatedUser.status } });
    },
    async getUserTransactions(req, res) {
      const userId = parseId(req.params.id);
      return res.json(await db.listTransactions(userId));
    },
    async getUserSummary(req, res) {
      const userId = parseId(req.params.id);
      return res.json(await calculateSummary(db, userId));
    },
    async listMilestones(req, res) {
      return res.json(await db.listMilestones());
    },
    async createMilestone(req, res) {
      const { name, description, icon, condition, target } = req.body;
      if (!name || !condition) return jsonError(res, 400, 'Name and condition are required.');
      const m = await db.createMilestone({ name, description, icon, condition, target: Number(target) || 0 });
      return res.status(201).json(m);
    },
    async updateMilestone(req, res) {
      const id = parseId(req.params.id);
      const { name, description, icon, condition, target } = req.body;
      const m = await db.updateMilestone(id, { name, description, icon, condition, target: Number(target) || 0 });
      if (!m) return jsonError(res, 404, 'Milestone not found.');
      return res.json(m);
    },
    async deleteMilestone(req, res) {
      const id = parseId(req.params.id);
      const ok = await db.deleteMilestone(id);
      if (!ok) return jsonError(res, 404, 'Milestone not found.');
      return res.json({ message: 'Deleted' });
    },
    async assignMilestone(req, res) {
      const milestoneId = parseId(req.params.id);
      const { user_id } = req.body;
      if (!user_id) return jsonError(res, 400, 'user_id is required.');
      const b = await db.assignUserBadge(Number(user_id), milestoneId);
      return res.json(b);
    }
  };
}

module.exports = { createAdminController };
