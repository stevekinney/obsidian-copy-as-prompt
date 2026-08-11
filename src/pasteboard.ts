/**
 * Building the macOS pasteboard payload that carries file references.
 *
 * Putting *files* on the clipboard — rather than text or a single image — is
 * what lets one paste attach every image a note references. macOS represents
 * that as an `NSFilenamesPboardType` entry holding an XML property list of
 * absolute paths.
 *
 * This is not an officially supported Electron API; `clipboard.writeBuffer`
 * simply hands a raw buffer to a named pasteboard type. The payload format is
 * the fragile part, so it lives here, pure and tested, and the caller verifies
 * the write actually landed before trusting it.
 */

/** The pasteboard type macOS uses for a list of file paths. */
export const FILENAMES_FORMAT = 'NSFilenamesPboardType';

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * Escape the characters that would otherwise break the property list.
 *
 * Vault paths can contain `&` — `Q&A notes.png` is an entirely ordinary
 * filename — and an unescaped one makes the whole plist unparseable, which
 * surfaces as a silently empty clipboard.
 */
export function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (character) => XML_ESCAPES[character] ?? character);
}

/**
 * Build the property list naming each file.
 *
 * @param paths - Absolute paths to the files. Relative paths do not work.
 * @returns The XML property list, ready to be written as a UTF-8 buffer.
 */
export function filenamesPlist(paths: readonly string[]): string {
  const entries = paths.map((path) => `\t<string>${escapeXml(path)}</string>`).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<array>',
    entries,
    '</array>',
    '</plist>',
    '',
  ].join('\n');
}
