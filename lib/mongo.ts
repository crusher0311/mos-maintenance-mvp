import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
if (!uri) throw new Error("Missing MONGODB_URI");

let client: MongoClient;
declare global { var _mongoClient: MongoClient | undefined }

export async function getMongo() {
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri);
  }
  client = global._mongoClient;
  if (!client.topology?.isConnected()) {
    await client.connect();
  }
  return client;
}
