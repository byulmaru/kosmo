import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatUnreadNotificationBadge,
  getUnreadNotificationAccessibilityLabel,
  getUnreadNotificationCountForProfile,
  getVisibleUnreadNotificationCount,
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

  it('shows the last successful count only for its profile', () => {
    const lastSuccess = { profileId: 'profile-a', count: 7 };

    assert.equal(getVisibleUnreadNotificationCount(lastSuccess, 'profile-a'), 7);
    assert.equal(getVisibleUnreadNotificationCount(lastSuccess, 'profile-b'), null);
    assert.equal(getVisibleUnreadNotificationCount(null, 'profile-a'), null);
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
