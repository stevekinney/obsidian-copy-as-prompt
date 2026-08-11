import { afterEach, mock, setSystemTime } from 'bun:test';
import chalk from 'chalk';

// Sentinel so tests can assert the preload actually ran.
(globalThis as Record<string, unknown>)['__BUN_TEST_SETUP_LOADED__'] = true;

// Chalk picks its colour level from the *test runner's* stdout: ANSI codes
// under a real terminal, plain text when piped. Any test asserting on rendered
// output would then pass when piped — including in CI, whose logs are not a
// TTY — and fail only in an interactive terminal, which is how `npm publish`
// runs `prepublishOnly`. Pinning the level here makes those assertions
// deterministic in both contexts. Note that setting NO_COLOR at runtime does
// *not* work: chalk resolves its level before a preload can change the env.
// Test colour behaviour itself by spawning a subprocess with an explicit env.
chalk.level = 0;

afterEach(() => {
  mock.restore();
  setSystemTime();
});
