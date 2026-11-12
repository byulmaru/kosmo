import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getProfileEditActionCurrentState,
  getProfileEditActionTargetMetrics,
  getShellLayout,
  getShellRoutePresentation,
  isNativeDrawerSwipeEnabled,
  isSettingsRoute,
  isTimelineRoute,
} from './shellLayout';

describe('getShellLayout', () => {
  it('keeps native tablets on the mobile shell', () => {
    assert.equal(getShellLayout(false, 1_024), 'mobile');
  });

  it('maps the Profile summary edit action to each platform input target', () => {
    assert.deepEqual(getProfileEditActionTargetMetrics('web'), { height: 32, top: 158 });
    assert.deepEqual(getProfileEditActionTargetMetrics('ios'), { height: 44, top: 152 });
    assert.deepEqual(getProfileEditActionTargetMetrics('android'), { height: 48, top: 150 });
  });

  it('maps the exact Profile edit route to Web and Native current state', () => {
    assert.deepEqual(getProfileEditActionCurrentState('/profile-edit'), {
      accessibilityState: { selected: true },
      ariaCurrent: 'page',
    });
    assert.deepEqual(getProfileEditActionCurrentState('/profile-edit/avatar'), {
      accessibilityState: { selected: false },
      ariaCurrent: undefined,
    });
  });

  it('applies compact and full breakpoints only on web', () => {
    assert.equal(getShellLayout(true, 767), 'mobile');
    assert.equal(getShellLayout(true, 768), 'compact');
    assert.equal(getShellLayout(true, 1_280), 'full');
  });

  it('treats only the canonical Settings route family as Settings', () => {
    assert.equal(isSettingsRoute('/settings'), true);
    assert.equal(isSettingsRoute('/settings/profile'), true);
    assert.equal(isSettingsRoute('/settings/default-post-visibility'), true);
    assert.equal(isSettingsRoute('/settings/profile-migration'), true);
    assert.equal(isSettingsRoute('/settings/following-import'), true);
    assert.equal(isSettingsRoute('/settings-legacy'), false);
    assert.equal(isSettingsRoute('/profile/settings'), false);
  });

  it('treats Home and Local as one primary timeline route family', () => {
    assert.equal(isTimelineRoute('/home'), true);
    assert.equal(isTimelineRoute('/local'), true);
    assert.equal(isTimelineRoute('/local/post'), false);
    assert.equal(isTimelineRoute('/search'), false);
  });

  it('enables Native drawer edge swipe only on approved top-level routes', () => {
    for (const pathname of ['/home', '/local', '/search', '/notifications']) {
      assert.equal(isNativeDrawerSwipeEnabled(pathname), true, pathname);
    }

    for (const pathname of [
      '/@writer',
      '/@writer/post-id',
      '/@writer/followers',
      '/@writer/following',
      '/settings',
      '/settings/info',
      '/bookmarks',
    ]) {
      assert.equal(isNativeDrawerSwipeEnabled(pathname), false, pathname);
    }
  });

  it('replaces only the full Web RightRail with the Settings workspace', () => {
    assert.deepEqual(getShellRoutePresentation(true, 1_280, '/settings'), {
      layout: 'full',
      settingsWorkspace: true,
      showRightRail: false,
    });
    assert.deepEqual(getShellRoutePresentation(true, 1_280, '/home'), {
      layout: 'full',
      settingsWorkspace: false,
      showRightRail: true,
    });
    assert.deepEqual(getShellRoutePresentation(true, 1_280, '/compose'), {
      layout: 'full',
      settingsWorkspace: false,
      showRightRail: false,
    });
    assert.deepEqual(getShellRoutePresentation(true, 768, '/settings/default-post-visibility'), {
      layout: 'compact',
      settingsWorkspace: false,
      showRightRail: false,
    });
    assert.deepEqual(getShellRoutePresentation(true, 768, '/settings/profile'), {
      layout: 'compact',
      settingsWorkspace: false,
      showRightRail: false,
    });
    assert.deepEqual(getShellRoutePresentation(false, 1_280, '/settings'), {
      layout: 'mobile',
      settingsWorkspace: false,
      showRightRail: false,
    });
  });
});
