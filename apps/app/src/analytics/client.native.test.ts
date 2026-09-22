import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  captureSearchProfileAnalytics,
  clearAnalytics,
  identifyAnalytics,
  observeAnalyticsSession,
  trackAnalytics,
} from './client';

describe('Native analytics client', () => {
  it('keeps the shared analytics interface as a no-op without a Web SDK', () => {
    assert.doesNotThrow(() =>
      trackAnalytics('profile_created', { selected_profile_id: 'profile-id' }),
    );
    assert.doesNotThrow(() => identifyAnalytics('account-id'));
    assert.doesNotThrow(() => clearAnalytics());
    assert.equal(
      captureSearchProfileAnalytics([
        'search_profile_journey_started',
        { search_profile_journey_id: 'opaque', source: 'search_people' },
      ]),
      null,
    );
    let notifications = 0;
    const unsubscribe = observeAnalyticsSession(() => {
      notifications += 1;
    });
    unsubscribe();
    assert.equal(notifications, 0);
  });
});
