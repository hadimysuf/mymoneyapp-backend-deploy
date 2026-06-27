const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://hadimysuf:hadimysuf2002@ysuf.vizv5bz.mongodb.net/?appName=ysuf";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("mymoneyapp");
    const users = await db.collection("users").find().toArray();
    const cats = await db.collection("categories").find().toArray();
    const trans = await db.collection("transactions").find().toArray();
    
    const defaultCats = [
      { id: Date.now() + 1, name: 'Makanan & Minuman', type: 'expense', user_id: 1776629168876 },
      { id: Date.now() + 2, name: 'Tabungan Masa Depan', type: 'savings', user_id: 1776629168876 }
    ];
    await db.collection("categories").insertMany(defaultCats);
    console.log("Kategori berhasil ditambahkan!");
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
