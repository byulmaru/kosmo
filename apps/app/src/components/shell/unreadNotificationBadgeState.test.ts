import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatUnreadNotificationBadge,
  getUnreadNotificationAccessibilityLabel,
  getUnreadNotificationCountForProfile,
  getVisibleUnreadNotificationCount,
  reduceUnreadNotificationBadgeState,
} from './unreadNotificationBadgeState';

describe('unread notification badge state', () => {
  it('formats zero, exact counts, and capped counts', () => {
    assert.equal(formatUnreadNotificationBadge(0), null);
    assert.equal(formatUnreadNotificationBadge(1), '1');
    assert.equal(formatUnreadNotificationBadge(99), '99');
    assert.equal(formatUnreadNotificationBadge(100), '99+');
  });

  it('uses the actual count in the accessible notification name', () => {
    assert.equal(getUnreadNotificationAccessibilityLabel(0), '알림');
    assert.equal(getUnreadNotificationAccessibilityLabel(127), '알림, 읽지 않은 알림 127개');
  });

  it('hides the previous count on the first render after a profile switch', () => {
    const previous = { activeProfileId: 'profile-a', lastSuccessCount: 12 };

    assert.equal(getVisibleUnreadNotificationCount(previous, 'profile-b'), null);
    assert.deepEqual(
      reduceUnreadNotificationBadgeState(previous, { type: 'select', profileId: 'profile-b' }),
      {
        activeProfileId: 'profile-b',
        lastSuccessCount: null,
      },
    );
  });

  it('keeps a same-profile successful count after a fetch error', () => {
    const successful = reduceUnreadNotificationBadgeState(
      { activeProfileId: 'profile-a', lastSuccessCount: null },
      { type: 'success', profileId: 'profile-a', count: 7 },
    );

    assert.deepEqual(
      reduceUnreadNotificationBadgeState(successful, { type: 'error', profileId: 'profile-a' }),
      successful,
    );
  });

  it('rejects a stale result from a previously selected profile', () => {
    const selected = { activeProfileId: 'profile-b', lastSuccessCount: null };

    assert.deepEqual(
      reduceUnreadNotificationBadgeState(selected, {
        type: 'success',
        profileId: 'profile-a',
        count: 7,
      }),
      selected,
    );
  });

  it('ignores a snapshot count whose profile ID differs from the selected profile', () => {
    assert.equal(
      getUnreadNotificationCountForProfile(
        { id: 'profile-a', unreadNotificationCount: 7 },
        'profile-b',
      ),
      null,
    );
  });
});
