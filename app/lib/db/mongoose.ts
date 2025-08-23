// app/lib/db/mongoose.ts
import mongoose from "mongoose";

const globalAny = global as any;

let cached = globalAny._mongooseConn;
if (!cached) {
  cached = globalAny._mongooseConn = { conn: null as typeof mongoose | null, promise: null as Promise<typeof mongoose> | null };
}

export async function connectToMongo() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set in environment");
    }
    cached.promise = mongoose
      .connect(uri, {
        // add options if needed
        maxPoolSize: 10,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
