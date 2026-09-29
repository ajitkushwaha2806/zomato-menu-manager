import { MongoClient } from "mongodb";
import fs from "fs";
const uri = "mongodb+srv://ajitkushwaha3101:snehavats1404@menu-manager.yslxv8v.mongodb.net/production?retryWrites=true&w=majority&appName=menu-manager";
async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("production");
  const sync = await db.collection("menusyncs").findOne({ status: "completed" }, { sort: { _id: -1 } });
  fs.writeFileSync("sync.json", JSON.stringify(sync, null, 2));
  console.log("Done");
  await client.close();
}
run();
