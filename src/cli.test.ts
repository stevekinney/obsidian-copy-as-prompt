import { describe, expect, it } from 'bun:test';

import { buildCommand, flagsFrom, shellQuote, type CommandOptions } from './cli.js';

const base: CommandOptions = {
  command: 'claude',
  flags: [],
  addDirFlag: 'add-dir',
  extraArguments: '',
  prompt: 'Hello',
  heredocThreshold: 1000,
};

describe('shellQuote', () => {
  it('wraps a plain value', () => {
    expect(shellQuote('hello')).toBe("'hello'");
  });

  it('leaves shell metacharacters literal', () => {
    // Inside single quotes none of these are special, which is the entire
    // reason this is the chosen quoting form — the value passes through whole.
    const value = '$HOME `whoami` !! "x" \\n';

    expect(shellQuote(value)).toBe(`'${value}'`);
  });

  it('preserves newlines', () => {
    expect(shellQuote('a\nb')).toBe("'a\nb'");
  });

  it('splices an embedded single quote', () => {
    // The one character a single-quoted string cannot contain.
    expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`);
  });

  it('handles a value that is only quotes', () => {
    expect(shellQuote("''")).toBe(String.raw`''\'''\'''`);
  });
});

describe('flagsFrom', () => {
  it('forwards an allowed key', () => {
    expect(flagsFrom({ model: 'opus' }, ['model'])).toEqual([{ name: 'model', values: ['opus'] }]);
  });

  it('ignores a key that is not allowed', () => {
    // Ordinary Obsidian properties would otherwise become flags the CLI rejects.
    expect(flagsFrom({ model: 'opus', tags: ['work'] }, ['model'])).toEqual([
      { name: 'model', values: ['opus'] },
    ]);
  });

  it('follows the allowlist order so commands stay stable', () => {
    const flags = flagsFrom({ effort: 'high', model: 'opus' }, ['model', 'effort']);

    expect(flags.map((flag) => flag.name)).toEqual(['model', 'effort']);
  });

  it('emits a bare flag for true', () => {
    expect(flagsFrom({ verbose: true }, ['verbose'])).toEqual([{ name: 'verbose', values: [] }]);
  });

  it('omits a false flag entirely', () => {
    expect(flagsFrom({ verbose: false }, ['verbose'])).toEqual([]);
  });

  it('repeats a flag for each array entry', () => {
    expect(flagsFrom({ 'add-dir': ['/a', '/b'] }, ['add-dir'])).toEqual([
      { name: 'add-dir', values: ['/a', '/b'] },
    ]);
  });

  it('stringifies a number', () => {
    expect(flagsFrom({ turns: 3 }, ['turns'])).toEqual([{ name: 'turns', values: ['3'] }]);
  });

  it('skips a null or missing value', () => {
    expect(flagsFrom({ model: null }, ['model', 'effort'])).toEqual([]);
  });

  it('skips an empty string', () => {
    expect(flagsFrom({ model: '' }, ['model'])).toEqual([]);
  });

  it('tolerates a note with no frontmatter', () => {
    expect(flagsFrom(null, ['model'])).toEqual([]);
  });
});

describe('buildCommand', () => {
  it('builds a bare command', () => {
    expect(buildCommand(base)).toBe("claude 'Hello'");
  });

  it('includes flags before the prompt', () => {
    const flags = [{ name: 'model', values: ['opus'] }];

    expect(buildCommand({ ...base, flags })).toBe("claude --model opus 'Hello'");
  });

  it('leaves a simple flag value unquoted but quotes an awkward one', () => {
    const flags = [{ name: 'note', values: ['two words'] }];

    expect(buildCommand({ ...base, flags })).toBe("claude --note 'two words' 'Hello'");
  });

  it('repeats a flag with several values', () => {
    const flags = [{ name: 'add-dir', values: ['/a', '/b'] }];

    expect(buildCommand({ ...base, flags })).toBe("claude --add-dir /a --add-dir /b 'Hello'");
  });

  it('adds the vault directory first', () => {
    expect(buildCommand({ ...base, addDir: '/Users/steve/Vaults/notes' })).toBe(
      "claude --add-dir /Users/steve/Vaults/notes 'Hello'",
    );
  });

  it('quotes a vault directory containing spaces', () => {
    expect(buildCommand({ ...base, addDir: '/Users/steve/My Vault' })).toBe(
      "claude --add-dir '/Users/steve/My Vault' 'Hello'",
    );
  });

  it('uses a configured directory flag', () => {
    const command = buildCommand({ ...base, addDir: '/vault', addDirFlag: 'workspace' });

    expect(command).toBe("claude --workspace /vault 'Hello'");
  });

  it('omits directory access when the flag name is blank', () => {
    expect(buildCommand({ ...base, addDir: '/vault', addDirFlag: '' })).toBe("claude 'Hello'");
  });

  it('inserts extra arguments verbatim before the prompt', () => {
    // Verbatim on purpose: this field is a place to write shell, so quoting it
    // would defeat the point.
    const command = buildCommand({ ...base, extraArguments: '-p --permission-mode acceptEdits' });

    expect(command).toBe("claude -p --permission-mode acceptEdits 'Hello'");
  });

  it('ignores whitespace-only extra arguments', () => {
    expect(buildCommand({ ...base, extraArguments: '   ' })).toBe("claude 'Hello'");
  });

  it('switches to a heredoc past the threshold', () => {
    const prompt = 'x'.repeat(20);
    const command = buildCommand({ ...base, prompt, heredocThreshold: 10 });

    expect(command).toBe(`claude "$(cat <<'PROMPT'\n${prompt}\nPROMPT\n)"`);
  });

  it('quotes the heredoc opener so the body is never expanded', () => {
    const prompt = 'cost is $HOME and `date`'.padEnd(40, '.');
    const command = buildCommand({ ...base, prompt, heredocThreshold: 10 });

    expect(command).toContain("<<'PROMPT'");
    expect(command).toContain('$HOME');
  });

  it('defuses a body line that would close the heredoc early', () => {
    const prompt = `start\nPROMPT\nend`.padEnd(40, '.');
    const command = buildCommand({ ...base, prompt, heredocThreshold: 10 });

    expect(command).toContain('\n PROMPT\n');
    expect(command.match(/^PROMPT$/gm)).toHaveLength(1);
  });
});
