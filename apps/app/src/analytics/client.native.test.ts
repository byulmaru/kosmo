import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearAnalytics,
  identifyAnalytics,
  trackAnalytics,
  trackAnalyticsForAccount,
} from './client';

describe('Native analytics client', () => {
  it('keeps the shared analytics interface as a no-op without a Web SDK', () => {
    assert.doesNotThrow(() =>
      trackAnalytics('profile_created', { selected_profile_id: 'profile-id' }),
    );
    assert.doesNotThrow(() => identifyAnalytics('account-id'));
    assert.doesNotThrow(() => clearAnalytics());
    assert.doesNotThrow(() => trackAnalytics('profile_view_succeeded', {}));
    assert.doesNotThrow(() =>
      trackAnalyticsForAccount('account-id', 'reaction_added', {
        reaction_type: 'custom',
        emoji_kind: 'unicode',
        reaction_emoji_key: 'unicode:1f389',
      }),
    );
  });
});
