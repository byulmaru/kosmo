import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getProfileEditActionCurrentState,
  getProfileEditActionTargetMetrics,
  getShellLayout,
  getShellRoutePresentation,
  getWebMobileShellHeader,
  getWebMobileShellHeaderStickyOffset,
  isSettingsRoute,
  isTimelineRoute,
  isWebMobileRouteOwnedHeader,
  profileEditActionLabelColor,
} from './shellLayout';

describe('getShellLayout', () => {
  const postDetailSegments = ['(tabs)', '(post)', '[profileHandle]', '[postId]'] as const;

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

  it('keeps the yellow edit action label dark in every color scheme', () => {
    assert.equal(profileEditActionLabelColor, '#111111');
  });

  it('applies compact and full breakpoints only on web', () => {
    assert.equal(getShellLayout(true, 767), 'mobile');
    assert.equal(getShellLayout(true, 768), 'compact');
    assert.equal(getShellLayout(true, 1_280), 'full');
  });

  it('offsets a Web mobile detail header below the shell header only', () => {
    assert.equal(getWebMobileShellHeaderStickyOffset(767), 64);
    assert.equal(getWebMobileShellHeaderStickyOffset(768), 0);
    assert.equal(getWebMobileShellHeaderStickyOffset(1_280), 0);
  });

  it('assigns only the approved Web mobile routes to the shell header', () => {
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/compose', []), {
      leading: 'menu',
      title: '글쓰기',
    });
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/notifications', []), {
      leading: 'menu',
      title: '알림',
    });
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/@writer/post-id', postDetailSegments), {
      leading: 'back',
      title: '게시글',
    });
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/writer/post-id', postDetailSegments), {
      leading: 'back',
      title: '게시글',
    });
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/settings', []), {
      leading: 'menu',
      title: '설정',
    });
    assert.deepEqual(getWebMobileShellHeader(true, 390, '/settings/default-post-visibility', []), {
      leading: 'back',
      title: '게시물 기본 공개 범위',
    });
    assert.equal(getWebMobileShellHeader(true, 390, '/bookmarks', []), null);
    assert.equal(getWebMobileShellHeader(true, 390, '/search', []), null);
    assert.equal(getWebMobileShellHeader(true, 390, '/@writer/followers', []), null);
    assert.equal(getWebMobileShellHeader(true, 390, '/@writer/following', []), null);
    assert.equal(getWebMobileShellHeader(true, 390, '/login/callback', []), null);
    assert.equal(getWebMobileShellHeader(true, 768, '/notifications', []), null);
    assert.equal(getWebMobileShellHeader(true, 1_280, '/notifications', []), null);
    assert.equal(getWebMobileShellHeader(false, 390, '/notifications', []), null);
  });

  it('treats only the canonical Settings route family as Settings', () => {
    assert.equal(isSettingsRoute('/settings'), true);
    assert.equal(isSettingsRoute('/settings/default-post-visibility'), true);
    assert.equal(isSettingsRoute('/settings-legacy'), false);
    assert.equal(isSettingsRoute('/profile/settings'), false);
  });

  it('treats Home and Local as one primary timeline route family', () => {
    assert.equal(isTimelineRoute('/home'), true);
    assert.equal(isTimelineRoute('/local'), true);
    assert.equal(isTimelineRoute('/local/post'), false);
    assert.equal(isTimelineRoute('/search'), false);
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
    assert.deepEqual(getShellRoutePresentation(true, 768, '/settings/default-post-visibility'), {
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

  it('assigns only mobile Web search to a route-owned header', () => {
    assert.equal(isWebMobileRouteOwnedHeader(true, 390, '/search'), true);
    assert.equal(isWebMobileRouteOwnedHeader(true, 390, '/notifications'), false);
    assert.equal(isWebMobileRouteOwnedHeader(true, 768, '/search'), false);
    assert.equal(isWebMobileRouteOwnedHeader(true, 1_280, '/search'), false);
    assert.equal(isWebMobileRouteOwnedHeader(false, 390, '/search'), false);
  });
});
