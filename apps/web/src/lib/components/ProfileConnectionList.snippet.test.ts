import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

const componentSource = readFileSync('src/lib/components/ProfileConnectionList.svelte', 'utf8');

describe('ProfileConnectionList profile row boundary', () => {
  test('keeps follow action ownership inside ProfileListItem instead of passing an action snippet', () => {
    expect.assertions(4);

    const compiled = compile(componentSource, {
      generate: 'client',
      dev: true,
      filename: 'ProfileConnectionList.svelte',
    }).js.code;

    expect(componentSource).not.toContain('FollowButton_profile');
    expect(componentSource).not.toContain('action?: Snippet');
    expect(compiled).not.toMatch(/\$\$slots: \{ action: true \}/);
    expect(compiled).not.toMatch(/ProfileListItem\(\$\$anchor, \{[\s\S]*?children:/);
  });
});
