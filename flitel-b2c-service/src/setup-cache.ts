import { getDatabase, closeDatabase } from "./mongodb.js";

try {
  const database = getDatabase();
  const exists = await database
    .listCollections({ name: "flight_searches" }, { nameOnly: true })
    .hasNext();
  const collection = database.collection("flight_searches");
  const count = exists ? await collection.estimatedDocumentCount() : 0;
  console.log(
    JSON.stringify({
      database: database.databaseName,
      collection: "flight_searches",
      exists,
      count,
    }),
  );
  const indexes = exists ? await collection.listIndexes().toArray() : [];
  const hasTtlIndex = indexes.some(
    (index) =>
      index.key.expiresAt === 1 &&
      Object.keys(index.key).length === 1 &&
      index.expireAfterSeconds === 0,
  );
  if (!hasTtlIndex) {
    if (count > 0)
      throw new Error(
        "Existing flight_searches records need review before adding an expiry index.",
      );
    await collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "expiresAt_ttl" },
    );
  }
  console.log("Flight search TTL index is ready.");
} finally {
  await closeDatabase();
}
