require('dotenv').config();

const { createApp, createMemoryDb } = require('./app');

const PORT = process.env.PORT || 3001;

async function startServer() {
  const options = process.env.MONGODB_URI ? {} : { db: createMemoryDb() };
  if (!process.env.MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI tidak ditemukan, menggunakan In-Memory Database untuk testing lokal.');
  }
  const { app, db } = await createApp(options);
  const server = app.listen(PORT, () => console.log(`Backend Finansial siap di http://localhost:${PORT}`));

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
