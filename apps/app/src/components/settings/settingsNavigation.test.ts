import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { returnToSettingsParent as ReturnToSettingsParent } from './settingsNavigation';

let returnToSettingsParent: typeof ReturnToSettingsParent;

before(async () => {
  ({ returnToSettingsParent } = await import('./settingsNavigation'));
});

describe('Settings detail back navigation', () => {
  it('각 detail은 canonical parent 경로로 dismissTo를 호출한다', () => {
    const dismissedTo: string[] = [];
    const router: Parameters<typeof returnToSettingsParent>[1] = {
      dismissTo: (href) => dismissedTo.push(String(href)),
    };
    const routes = [
      ['/settings/default-post-visibility', '/settings'],
      ['/settings/profile-migration', '/settings'],
      ['/settings/following-import', '/settings'],
      ['/settings/mute-and-block', '/settings'],
      ['/settings/muted-profiles', '/settings/mute-and-block'],
      ['/settings/blocked-profiles', '/settings/mute-and-block'],
      ['/settings/info', '/settings'],
      ['/settings/theme', '/settings'],
      ['/settings/developer', '/settings/info'],
    ] as const;

    for (const [pathname] of routes) {
      returnToSettingsParent(pathname, router);
    }

    assert.deepEqual(
      dismissedTo,
      routes.map(([, parentPath]) => parentPath),
    );
  });
});
