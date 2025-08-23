// /app/lib/mongo.ts
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "mos_mvp";

if (!uri) throw new Error("MONGODB_URI missing");
if (!dbName) throw new Error("MONGODB_DB missing");

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (!_client) {
    _client = new MongoClient(uri, { maxPoolSize: 10 });
    await _client.connect();
  }
  _db = _client.db(dbName);
  return _db;
}
