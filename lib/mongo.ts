// lib/mongo.ts
import { MongoClient, Db } from "mongodb";

let clientPromise: Promise<MongoClient> | undefined;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment variables`);
  return v;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Lazily create the client when first needed (avoids throwing during import)
export async function getMongoClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  const uri = requireEnv("MONGODB_URI");

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise!;
}

export async function getDb(name: string = process.env.MONGODB_DB || "mos-maintenance-mvp"): Promise<Db> {
  const client = await getMongoClient();
  return client.db(name);
}

