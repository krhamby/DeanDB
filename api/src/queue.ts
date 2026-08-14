// Server-side twin of the client queue in src/lib/musicbrainz.ts: one global
// serial queue so the whole service is a single polite MusicBrainz client.
// now/sleep are injectable so tests run on a virtual clock.
export type QueueOpts = {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createSerialQueue(opts: QueueOpts) {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastStarted = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = opts.minIntervalMs - (now() - lastStarted);
      if (wait > 0) await sleep(wait);
      lastStarted = now();
      return task();
    });
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
}
