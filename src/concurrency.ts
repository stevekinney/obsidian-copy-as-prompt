/**
 * Running async work a few items at a time.
 *
 * `Promise.all` over a folder starts every read at once. On a few hundred notes
 * that is a few hundred simultaneous file reads and every body resident at the
 * same time, which is a lot of pressure on the renderer for no gain — the work
 * is bounded by disk, not by how many requests are in flight.
 */

/** How many items are worked on at once. */
const LIMIT = 8;

/**
 * Map over items with a bounded number in flight, preserving order.
 *
 * @param items - The inputs.
 * @param work - The async operation for one input.
 * @returns The results, in the order the inputs were given.
 */
export async function mapLimited<In, Out>(
  items: readonly In[],
  work: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = Array.from({ length: items.length });
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;

      next += 1;
      results[index] = await work(items[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(LIMIT, items.length) }, worker));

  return results;
}
