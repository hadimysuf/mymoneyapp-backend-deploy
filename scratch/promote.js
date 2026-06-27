const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://hadimysuf:hadimysuf2002@ysuf.vizv5bz.mongodb.net/?appName=ysuf";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("mymoneyapp");
    const res = await db.collection("users").updateOne({ email: "suf@gmail.com" }, { $set: { role: "admin" } });
    console.log("Promoted user suf@gmail.com to admin!", res.modifiedCount);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
