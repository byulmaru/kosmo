import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getUnreadNotificationAccessibilityLabel,
  getVisibleUnreadNotificationCount,
} from './unreadNotificationBadgeState';

describe('unread notification badge state', () => {
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
});
