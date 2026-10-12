import { describe, expect, it, vi } from "vitest";
import { cached, resetResponseCache } from "./response-cache.js";

describe("cached", () => {
  it("serves a recent answer without loading again, then reloads after the lifetime", async () => {
    resetResponseCache();
    vi.useFakeTimers({ toFake: ["Date"] });
    const load = vi.fn().mockResolvedValue("rooms");
    expect(await cached("k", 1000, load)).toBe("rooms");
    expect(await cached("k", 1000, load)).toBe("rooms");
    expect(load).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1500);
    await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("runs one load for everyone asking at the same moment", async () => {
    resetResponseCache();
    const load = vi.fn(async () => "rooms");
    const answers = await Promise.all([cached("k", 1000, load), cached("k", 1000, load), cached("k", 1000, load)]);
    expect(answers).toEqual(["rooms", "rooms", "rooms"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never keeps a failure", async () => {
    resetResponseCache();
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("rooms");
    await expect(cached("k", 1000, load)).rejects.toThrow("down");
    expect(await cached("k", 1000, load)).toBe("rooms");
  });
});
