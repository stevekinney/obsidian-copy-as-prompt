/**
 * Writing to the system clipboard.
 */

/**
 * Put text on the clipboard.
 *
 * @param text - The text to copy.
 * @returns Whether the write succeeded.
 */
export async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
}
