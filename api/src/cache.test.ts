import { describe, expect, it } from "vitest";
import { createLruCache } from "./cache.js";

describe("createLruCache", () => {
  it("stores and retrieves values", () => {
    const c = createLruCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
    expect(c.get("missing")).toBeUndefined();
  });

  it("evicts the least recently used entry beyond maxEntries", () => {
    const c = createLruCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a"); // refresh a's recency
    c.set("c", "3"); // evicts b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
    expect(c.size).toBe(2);
  });

  it("expires entries after ttlMs", () => {
    let t = 0;
    const c = createLruCache<string>({ maxEntries: 5, ttlMs: 100, now: () => t });
    c.set("a", "1");
    t = 99;
    expect(c.get("a")).toBe("1");
    t = 100;
    expect(c.get("a")).toBeUndefined();
  });
});
