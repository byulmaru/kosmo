import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

const componentSource = readFileSync('src/lib/components/ProfileConnectionList.svelte', 'utf8');

describe('ProfileConnectionList action snippet', () => {
  test('passes the rendered profile action to ProfileListItem as a named action snippet', () => {
    expect.assertions(2);

    const compiled = compile(componentSource, {
      generate: 'client',
      dev: true,
      filename: 'ProfileConnectionList.svelte',
    }).js.code;

    expect(compiled).toMatch(
      /ProfileListItem\(\$\$anchor, \{[\s\S]*?action,\s*\$\$slots: \{ action: true \}/,
    );
    expect(compiled).not.toMatch(/ProfileListItem\(\$\$anchor, \{[\s\S]*?children:/);
  });
});
