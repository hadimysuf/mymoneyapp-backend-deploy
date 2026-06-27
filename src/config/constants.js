const CATEGORY_TYPES = new Set(['income', 'expense', 'savings']);
const INCOME_GROUPS = new Set(['salary', 'other']);
const SAVINGS_OUTFLOW_KEYWORDS = /\b(tarik|narik|ambil|withdraw|keluar|pakai|gunakan)\b/i;

const DEFAULT_DATA = {
  users: [],
  transactions: [],
  categories: [
    { id: 1, name: 'Gaji', type: 'income', group: 'salary' },
    { id: 2, name: 'Bonus/Freelance', type: 'income', group: 'other' },
    { id: 3, name: 'Makanan', type: 'expense' },
    { id: 4, name: 'Tabungan Masa Depan', type: 'savings' }
  ],
  budgets: [],
  milestones: [
    { id: 1, name: 'Sultan Baru', description: 'Transaksi pertama kali', icon: '🌟', condition: 'transaction_count', target: 1 },
    { id: 2, name: 'Si Rajin Nabung', description: 'Menabung lebih dari Rp 1.000.000', icon: '💰', condition: 'savings_amount', target: 1000000 },
    { id: 3, name: 'Pengguna Setia', description: 'Diberikan secara khusus oleh Admin', icon: '👑', condition: 'manual', target: 0 }
  ],
  user_badges: []
};

module.exports = {
  CATEGORY_TYPES,
  DEFAULT_DATA,
  INCOME_GROUPS,
  SAVINGS_OUTFLOW_KEYWORDS
};
