import { describe, expect, it } from 'bun:test';

import { mapLimited } from './concurrency.js';

/** Fails on one item, to check the rejection is not swallowed. */
function refusesTheSecond(): Promise<number[]> {
  return mapLimited([1, 2], async (value) => {
    if (value === 2) throw new Error('nope');

    return value;
  });
}

describe('mapLimited', () => {
  it('preserves input order', async () => {
    const results = await mapLimited([1, 2, 3, 4, 5], async (value) => value * 2);

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;

    await mapLimited(
      Array.from({ length: 50 }, (_, index) => index),
      async (value) => {
        running += 1;
        peak = Math.max(peak, running);
        await Promise.resolve();
        running -= 1;

        return value;
      },
    );

    expect(peak).toBeLessThanOrEqual(8);
  });

  it('handles an empty list', async () => {
    expect(await mapLimited([], async (value) => value)).toEqual([]);
  });

  it('propagates a failure', () => {
    expect(refusesTheSecond()).rejects.toThrow('nope');
  });
});
