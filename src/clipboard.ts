import { electronClipboard, supportsFileClipboard, utf8 } from './desktop.js';
import { FILENAMES_FORMAT, filenamesPlist } from './pasteboard.js';

/**
 * Writing to the system clipboard.
 *
 * Text and images are separate payloads. The web `ClipboardItem` API carries
 * at most one image per write, and putting files on the clipboard — Electron's
 * `writeBuffer` onto a named pasteboard type — replaces whatever text write
 * came before it. There is no single write that combines a note's `@` paths
 * with more than one image, so callers that want both run these as two
 * distinct operations rather than expecting one to deliver everything.
 */

/** Whether an attempt to put files on the clipboard succeeded. */
export type FileClipboardResult = 'written' | 'unsupported' | 'failed';

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

/**
 * Re-encode an image as PNG.
 *
 * `ClipboardItem` only reliably accepts `image/png`, so a JPEG or WebP has to
 * be converted before it can go on the clipboard at all.
 */
async function toPng(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');

    if (!context) return null;

    context.drawImage(bitmap, 0, 0);

    return await canvas.convertToBlob({ type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * Put a single image on the clipboard as image data.
 *
 * This is the fallback for when the file-list path isn't available — anywhere
 * that isn't macOS, or a macOS where the pasteboard write stopped working. One
 * image per copy, pasted as an image rather than attached as a file.
 *
 * @param data - The image bytes.
 * @param mimeType - The image's MIME type. Anything other than PNG is converted.
 * @returns Whether the write succeeded.
 */
export async function writeImage(data: ArrayBuffer, mimeType: string): Promise<boolean> {
  const blob = new Blob([data], { type: mimeType });
  const png = mimeType === 'image/png' ? blob : await toPng(blob);

  if (!png) return false;

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);

    return true;
  } catch {
    return false;
  }
}

/**
 * Put image *files* on the clipboard so one paste attaches all of them.
 *
 * This uses an Electron API that is not officially supported for this purpose
 * — `writeBuffer` onto a named macOS pasteboard type — so the write is read
 * back and verified rather than assumed. An Electron or macOS change that
 * breaks the payload format shows up here as `failed`, and the caller falls
 * back to copying images one at a time instead of leaving you with an empty
 * clipboard and no explanation.
 *
 * @param paths - Absolute paths to the files. Relative paths silently do nothing.
 * @returns What happened, so the caller can pick a fallback.
 */
export function writeFiles(paths: readonly string[]): FileClipboardResult {
  if (paths.length === 0) return 'unsupported';
  if (!supportsFileClipboard()) return 'unsupported';

  const clipboard = electronClipboard();

  if (!clipboard) return 'unsupported';

  try {
    clipboard.writeBuffer(FILENAMES_FORMAT, utf8(filenamesPlist(paths)));

    return clipboard.readBuffer(FILENAMES_FORMAT).length > 0 ? 'written' : 'failed';
  } catch {
    return 'failed';
  }
}
