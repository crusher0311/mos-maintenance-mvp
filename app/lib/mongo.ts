// app/lib/mongo.ts
import { MongoClient, Db } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  "mongodb://127.0.0.1:27017";

const DB_NAME =
  process.env.MONGODB_DB ||
  process.env.DB_NAME ||
  "mos-maintenance-mvp";

// Simple singleton to avoid multiple connections in dev/SSR
let _client: MongoClient | null = null;
let _connecting: Promise<MongoClient> | null = null;

async function connect(): Promise<MongoClient> {
  if (_client) return _client;
  if (_connecting) return _connecting;

  const client = new MongoClient(URI);
  _connecting = client
    .connect()
    .then((c) => {
      _client = c;
      return c;
    })
    .finally(() => {
      _connecting = null;
    });

  return _connecting;
}

export async function getMongo(): Promise<MongoClient> {
  return connect();
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(DB_NAME);
}
