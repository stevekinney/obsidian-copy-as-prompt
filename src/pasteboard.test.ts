import { describe, expect, it } from 'bun:test';

import { escapeXml, filenamesPlist } from './pasteboard.js';

describe('escapeXml', () => {
  it('escapes the characters that break a property list', () => {
    expect(escapeXml('Q&A <draft>')).toBe('Q&amp;A &lt;draft&gt;');
  });

  it('leaves an ordinary path alone', () => {
    expect(escapeXml('/Users/steve/a b.png')).toBe('/Users/steve/a b.png');
  });
});

describe('filenamesPlist', () => {
  it('lists each path as a string entry', () => {
    const plist = filenamesPlist(['/tmp/a.png', '/tmp/b.png']);

    expect(plist).toContain('<string>/tmp/a.png</string>');
    expect(plist).toContain('<string>/tmp/b.png</string>');
    expect(plist).toContain('<plist version="1.0">');
    expect(plist.trimEnd().endsWith('</plist>')).toBe(true);
  });

  it('escapes an ampersand in a filename', () => {
    // `Q&A notes.png` is an ordinary filename, and unescaped it makes the whole
    // plist unparseable — which shows up as a silently empty clipboard.
    expect(filenamesPlist(['/tmp/Q&A.png'])).toContain('<string>/tmp/Q&amp;A.png</string>');
  });

  it('produces a well-formed empty array', () => {
    expect(filenamesPlist([])).toContain('<array>\n\n</array>');
  });
});
