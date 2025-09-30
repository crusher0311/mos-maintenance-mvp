import { MongoClient, Db } from "mongodb";

const URI =
  process.env.MONGODB_URI ??
  process.env.MONGO_URL ??
  "mongodb://127.0.0.1:27017";

const DEFAULT_DB =
  process.env.MONGODB_DB ??
  process.env.DB_NAME ??
  "mos-maintenance-mvp";

// Optional separate DB for DataOne lookups. Falls back to DEFAULT_DB.
const DATAONE_DB = process.env.DATAONE_DB ?? DEFAULT_DB;

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

/** Return a connected MongoClient */
export async function getMongo(): Promise<MongoClient> {
  return connect();
}

/** Return a Db instance (defaults to your main app DB) */
export async function getDb(name: string = DEFAULT_DB): Promise<Db> {
  const client = await connect();
  return client.db(name);
}

/** DataOne DB helper (used by /api/dataone/* routes) */
export async function getDataOneDb(): Promise<Db> {
  const client = await connect();
  return client.db(DATAONE_DB);
}
