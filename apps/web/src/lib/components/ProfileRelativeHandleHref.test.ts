import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { getBottomTabItems } from './bottomTabBar';

const read = (path: string) => readFileSync(path, 'utf8');

describe('profile relativeHandle href boundary', () => {
  test('builds profile component hrefs from relativeHandle', () => {
    expect.assertions(9);

    const profileListItemSource = read('src/lib/components/ProfileListItem.svelte');
    const profileHeroSource = read('src/lib/components/ProfileHero.svelte');
    const postListItemSource = read('src/lib/components/PostListItem.svelte');
    const postLayoutSource = read('src/lib/components/PostLayout.svelte');

    expect(profileListItemSource).toContain('href={`/${fragment.data.relativeHandle}`}');
    expect(profileListItemSource).not.toContain('href={`/@${fragment.data.handle}`}');
    expect(profileHeroSource).toContain('href={`/${fragment.data.relativeHandle}/following`}');
    expect(profileHeroSource).toContain('href={`/${fragment.data.relativeHandle}/followers`}');
    expect(profileHeroSource).not.toContain('href={`/@${fragment.data.handle}/');
    expect(postListItemSource).toContain('profile.relativeHandle');
    expect(postListItemSource).not.toContain('`/@${postFragment.data.profile.handle}');
    expect(postLayoutSource).toContain('profile.relativeHandle');
    expect(postLayoutSource).not.toContain('`/@${postFragment.data.profile.handle}');
  });

  test('builds bottom tab profile href from relativeHandle', () => {
    expect.assertions(2);

    const tabs = getBottomTabItems({ selectedProfileRelativeHandle: '@alice@example.test' });
    const profileTab = tabs.find((tab) => tab.icon === 'profile');

    expect(profileTab?.href).toBe('/@alice@example.test');
    expect(profileTab?.disabled).toBe(false);
  });
});
