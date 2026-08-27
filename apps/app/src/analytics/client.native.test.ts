import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearAnalytics, identifyAnalytics, initializeAnalytics, trackAnalytics } from './client';

describe('Native analytics client', () => {
  it('keeps the shared analytics interface as a no-op without a Web SDK', () => {
    assert.equal(initializeAnalytics(), null);
    assert.doesNotThrow(() =>
      trackAnalytics('profile_created', { selected_profile_id: 'profile-id' }),
    );
    assert.equal(identifyAnalytics('account-id'), true);
    assert.equal(clearAnalytics(), true);
  });
});
