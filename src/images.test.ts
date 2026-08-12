import { describe, expect, it } from 'bun:test';

import { refAt, target } from '../test/factories.js';
import { embeddedImages } from './images.js';

describe('embeddedImages', () => {
  it('finds an embedded image', () => {
    const content = 'See ![[diagram.png]] above';
    const item = refAt(content, '![[diagram.png]]', {
      target: target({
        vaultPath: 'Assets/diagram.png',
        displayPath: '~/Vaults/Assets/diagram.png',
      }),
    });

    expect(embeddedImages([item])).toEqual(['Assets/diagram.png']);
  });

  it('ignores a plain link, even to an image', () => {
    const content = 'See [[diagram.png]] above';
    const item = refAt(content, '[[diagram.png]]', {
      target: target({ vaultPath: 'Assets/diagram.png' }),
    });

    expect(embeddedImages([item])).toEqual([]);
  });

  it('ignores an embedded note', () => {
    const content = '![[Design]]';
    const item = refAt(content, '![[Design]]', {
      target: target({ vaultPath: 'Work/Design.md' }),
    });

    expect(embeddedImages([item])).toEqual([]);
  });

  it('ignores an embedded attachment that is not an image', () => {
    const content = '![[notes.pdf]]';
    const item = refAt(content, '![[notes.pdf]]', {
      target: target({ vaultPath: 'Assets/notes.pdf' }),
    });

    expect(embeddedImages([item])).toEqual([]);
  });

  it('skips a withheld target', () => {
    const content = '![[secret.png]]';
    const item = refAt(content, '![[secret.png]]', {
      target: target({ vaultPath: 'Personal/secret.png', excluded: true }),
    });

    expect(embeddedImages([item])).toEqual([]);
  });

  it('skips an unresolved embed', () => {
    const content = '![[missing.png]]';
    const item = refAt(content, '![[missing.png]]', { target: null });

    expect(embeddedImages([item])).toEqual([]);
  });

  it('dedupes an image embedded more than once, keeping first order', () => {
    const content = '![[a.png]] then ![[b.png]] then ![[a.png]] again';
    const a1 = refAt(content, '![[a.png]]', { target: target({ vaultPath: 'a.png' }) });
    const b = { ...refAt(content, '![[b.png]]', { target: target({ vaultPath: 'b.png' }) }) };
    const secondA = content.lastIndexOf('![[a.png]]');
    const a2 = {
      ...a1,
      start: secondA,
      end: secondA + '![[a.png]]'.length,
    };

    expect(embeddedImages([a1, b, a2])).toEqual(['a.png', 'b.png']);
  });

  it('matches an image extension case-insensitively', () => {
    const content = '![[Photo.PNG]]';
    const item = refAt(content, '![[Photo.PNG]]', {
      target: target({ vaultPath: 'Assets/Photo.PNG' }),
    });

    expect(embeddedImages([item])).toEqual(['Assets/Photo.PNG']);
  });

  it('is empty for a note with no references', () => {
    expect(embeddedImages([])).toEqual([]);
  });
});
