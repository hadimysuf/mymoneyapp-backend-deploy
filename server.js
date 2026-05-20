require('dotenv').config();
const { createApp } = require('./app');

// =========================================================================
// 1. BAGIAN UNTUK VERCEL (SERVERLESS)
// Vercel akan membaca bagian export ini saat aplikasi di-deploy
// =========================================================================
let appInstance;

module.exports = async (req, res) => {
  // Jika aplikasi belum diinisialisasi, jalankan createApp()
  if (!appInstance) {
    try {
      const { app } = await createApp();
      appInstance = app;
    } catch (error) {
      console.error("Gagal melakukan inisialisasi aplikasi:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
  // Teruskan request dari user ke aplikasi Express
  return appInstance(req, res);
};

// =========================================================================
// 2. BAGIAN UNTUK LOKAL (LAPTOP)
// Hanya akan dijalankan jika kamu mengetik "node server.js" di terminal
// =========================================================================
if (require.main === module) {
  const PORT = process.env.PORT || 3001;

  async function startServer() {
    const { app, db } = await createApp();
    const server = app.listen(PORT, () => {
        console.log(`Backend Finansial siap di http://localhost:${PORT}`);
    });

    const shutdown = async () => {
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  startServer().catch((error) => {
    console.error('Gagal menjalankan backend:', error);
    process.exit(1);
  });
}