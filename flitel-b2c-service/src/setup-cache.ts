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

  // Created up front so the first booking or sign-in does not race to create them.
  const existing = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  for (const name of ["booking_attempts", "email_otps", "profiles", "hotel_cache"]) {
    if (!existing.has(name)) await database.createCollection(name);
  }
  // Email codes carry their own expiry; this only sweeps finished send windows.
  await database
    .collection("email_otps")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expiresAt_ttl" });
  await database
    .collection("hotel_cache")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expiresAt_ttl" });
  console.log("booking_attempts, email_otps, profiles and hotel_cache (both with TTL indexes) are ready.");
} finally {
  await closeDatabase();
}
