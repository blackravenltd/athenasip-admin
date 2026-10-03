import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The README states the version under its header, and it has to be the one
 * `package.json` carries. A version that is only in one place is a version
 * that is wrong in the other within a release or two.
 */
describe('the README version line', () => {
  it('matches package.json', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain(`# AthenaSIP Admin\n\n*v${version}*\n`);
  });
});
