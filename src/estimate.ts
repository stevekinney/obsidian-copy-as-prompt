/**
 * Guessing how big a prompt is before you send it.
 *
 * There is no tokenizer here on purpose. A real one is a megabyte-scale
 * dependency that would be bundled into `main.js` and downloaded by every user,
 * to answer a question where "roughly" is enough — you want to know whether
 * this is four thousand tokens or four hundred thousand, not the exact figure.
 *
 * Four characters per token is the usual rule of thumb for English prose. It
 * under-counts code and CJK text, so the number is labelled as an estimate
 * everywhere it appears.
 */

const CHARACTERS_PER_TOKEN = 4;

/** What a prompt is made of. */
export type PromptSize = {
  characters: number;
  tokens: number;
  notes: number;
  images: number;
};

/** Estimate the token count of a string. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

/** Measure a rendered prompt. */
export function measure(text: string, notes: number, images: number): PromptSize {
  return { characters: text.length, tokens: estimateTokens(text), notes, images };
}

/** Round to a compact human figure: `840`, `4.2k`, `128k`. */
export function compact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;

  return `${Math.round(value / 1000)}k`;
}

/** `1 note` / `3 notes`, so summaries read like sentences. */
function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}

/**
 * A one-line summary of a prompt's size.
 *
 * @param size - The measured prompt.
 * @returns Something like `~4.2k tokens · 3 notes · 2 images`.
 */
export function describe(size: PromptSize): string {
  const parts = [`~${compact(size.tokens)} tokens`, count(size.notes, 'note')];

  if (size.images > 0) parts.push(count(size.images, 'image'));

  return parts.join(' · ');
}
