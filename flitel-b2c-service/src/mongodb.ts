import { MongoClient } from "mongodb";
import type { Collection, Db, Document } from "mongodb";

let client: MongoClient | undefined;

export function getDatabase(): Db {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not configured.");
  client ??= new MongoClient(uri, {
    maxPoolSize: 10,
    connectTimeoutMS: 3000,
    serverSelectionTimeoutMS: 3000,
    timeoutMS: 3000,
  });
  return client.db(process.env.MONGODB_DBNAME || "flitel");
}

export function getFlightsCollection(): Collection<Document> {
  return getDatabase().collection("flights");
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = undefined;
}
