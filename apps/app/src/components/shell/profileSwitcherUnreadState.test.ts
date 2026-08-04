import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProfileSwitcherUnreadSnapshot,
  getProfileSwitcherHasUnread,
  isCurrentProfileSwitcherUnreadRequest,
} from './profileSwitcherUnreadState';

describe('profile switcher unread state', () => {
  it('discards exact counts and replaces omitted Profiles', () => {
    const first = createProfileSwitcherUnreadSnapshot('account-a', [
      { id: 'profile-a', unreadNotificationCount: 0 },
      { id: 'profile-b', unreadNotificationCount: 127 },
    ]);
    const next = createProfileSwitcherUnreadSnapshot('account-a', [
      { id: 'profile-a', unreadNotificationCount: 4 },
    ]);

    assert.deepEqual(first, {
      accountId: 'account-a',
      hasUnreadByProfileId: { 'profile-a': false, 'profile-b': true },
    });
    assert.equal(getProfileSwitcherHasUnread(next, 'account-a', 'profile-a'), true);
    assert.equal(getProfileSwitcherHasUnread(next, 'account-a', 'profile-b'), false);
  });

  it('never exposes a snapshot to another Account', () => {
    const snapshot = createProfileSwitcherUnreadSnapshot('account-a', [
      { id: 'profile-a', unreadNotificationCount: 1 },
    ]);

    assert.equal(getProfileSwitcherHasUnread(snapshot, 'account-b', 'profile-a'), false);
    assert.equal(getProfileSwitcherHasUnread(null, 'account-a', 'profile-a'), false);
  });

  it('accepts only the same Account, environment, generation, and request version', () => {
    const environment = {};
    const request = {
      accountId: 'account-a',
      environment,
      environmentGeneration: 3,
      requestVersion: 7,
    };

    assert.equal(isCurrentProfileSwitcherUnreadRequest(request, request), true);
    assert.equal(
      isCurrentProfileSwitcherUnreadRequest(request, { ...request, accountId: 'account-b' }),
      false,
    );
    assert.equal(
      isCurrentProfileSwitcherUnreadRequest(request, { ...request, environment: {} }),
      false,
    );
    assert.equal(
      isCurrentProfileSwitcherUnreadRequest(request, {
        ...request,
        environmentGeneration: 4,
      }),
      false,
    );
    assert.equal(
      isCurrentProfileSwitcherUnreadRequest(request, { ...request, requestVersion: 8 }),
      false,
    );
  });
});
