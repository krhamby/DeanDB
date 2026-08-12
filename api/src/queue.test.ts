import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./queue.js";

function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe("createSerialQueue", () => {
  it("runs tasks serially, spaced by minIntervalMs", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 1000, ...clock });
    const started: number[] = [];
    await Promise.all([
      schedule(async () => started.push(clock.now())),
      schedule(async () => started.push(clock.now())),
      schedule(async () => started.push(clock.now())),
    ]);
    expect(started).toEqual([0, 1000, 2000]);
  });

  it("keeps the chain alive after a rejection", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 1000, ...clock });
    await expect(schedule(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(schedule(async () => "ok")).resolves.toBe("ok");
  });

  it("returns each task's own result", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 10, ...clock });
    const [a, b] = await Promise.all([schedule(async () => 1), schedule(async () => 2)]);
    expect([a, b]).toEqual([1, 2]);
  });
});
