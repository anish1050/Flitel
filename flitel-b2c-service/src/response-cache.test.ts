import { beforeEach, describe, expect, it, vi } from "vitest";

const { stored, database } = vi.hoisted(() => ({
  stored: new Map<string, { _id: string; expiresAt: Date; data: unknown }>(),
  database: { down: false },
}));
vi.mock("./mongodb.js", () => ({
  getDatabase: () => {
    if (database.down) throw new Error("database down");
    return {
      collection: () => ({
        findOne: async ({ _id }: { _id: string }) => stored.get(_id) ?? null,
        replaceOne: async ({ _id }: { _id: string }, document: { expiresAt: Date; data: unknown }) =>
          void stored.set(_id, { _id, ...document }),
      }),
    };
  },
}));
import { cached, resetResponseCache } from "./response-cache.js";

beforeEach(() => {
  stored.clear();
  database.down = false;
  resetResponseCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("serves a recent answer without loading again, then reloads after the lifetime", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const load = vi.fn().mockResolvedValue("rooms");
    expect(await cached("k", 1000, load)).toBe("rooms");
    expect(await cached("k", 1000, load)).toBe("rooms");
    expect(load).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1500);
    await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("runs one load for everyone asking at the same moment", async () => {
    const load = vi.fn(async () => "rooms");
    const answers = await Promise.all([cached("k", 1000, load), cached("k", 1000, load), cached("k", 1000, load)]);
    expect(answers).toEqual(["rooms", "rooms", "rooms"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never keeps a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("rooms");
    await expect(cached("k", 1000, load)).rejects.toThrow("down");
    expect(await cached("k", 1000, load)).toBe("rooms");
    expect(stored.size).toBe(1);
  });

  it("writes to the collection and reads it back after memory is gone", async () => {
    await cached("search:goa", 60_000, async () => ({ hotels: ["lp1"] }));
    await vi.waitFor(() => expect(stored.has("search:goa")).toBe(true));

    resetResponseCache();
    const load = vi.fn(async () => ({ hotels: ["other"] }));
    expect(await cached("search:goa", 60_000, load)).toEqual({ hotels: ["lp1"] });
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores an expired stored answer", async () => {
    stored.set("k", { _id: "k", expiresAt: new Date(Date.now() - 1000), data: "old" });
    expect(await cached("k", 1000, async () => "fresh")).toBe("fresh");
  });

  it("still answers when the database is down", async () => {
    database.down = true;
    expect(await cached("k", 1000, async () => "rooms")).toBe("rooms");
  });
});
