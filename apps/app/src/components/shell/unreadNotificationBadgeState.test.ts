import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getUnreadNotificationAccessibilityLabel } from './unreadNotificationBadgeState';

describe('unread notification badge state', () => {
  it('uses the actual count in the accessible notification name', () => {
    assert.equal(getUnreadNotificationAccessibilityLabel(0), '알림');
    assert.equal(getUnreadNotificationAccessibilityLabel(127), '알림, 읽지 않은 알림 127개');
  });
});
