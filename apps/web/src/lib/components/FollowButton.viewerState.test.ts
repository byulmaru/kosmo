import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

const componentSource = readFileSync('src/lib/components/FollowButton.svelte', 'utf8');

describe('FollowButton viewer state boundary', () => {
  test('uses only relationship state from Profile.viewerState', () => {
    expect.assertions(8);

    const compiled = compile(componentSource, {
      generate: 'client',
      dev: true,
      filename: 'FollowButton.svelte',
    }).js.code;

    expect(componentSource).toContain('viewerState');
    expect(componentSource).toContain('isSelf');
    expect(componentSource).toContain('follow {');
    expect(componentSource).not.toContain('authenticated');
    expect(componentSource).not.toContain('hasSelectedProfile');
    expect(componentSource).not.toContain('canMutate');
    expect(componentSource).not.toContain('unavailableReason');
    expect(compiled).not.toContain('로그인 후 팔로우할 수 있습니다.');
  });
});
