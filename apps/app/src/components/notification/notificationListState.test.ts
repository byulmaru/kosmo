import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePaginationLoadErrorAfterRefresh } from './notificationListState';

describe('notification refresh state', () => {
  it('clears a stale pagination error after refresh succeeds', () => {
    assert.equal(resolvePaginationLoadErrorAfterRefresh(true, null), false);
  });
});
