import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capturePageview,
  clearAnalytics,
  identifyAnalytics,
  initializeAnalytics,
  trackAnalytics,
} from './client';

describe('Native analytics client', () => {
  it('keeps the shared analytics interface as a no-op without a Web SDK', () => {
    assert.equal(initializeAnalytics(), null);
    assert.doesNotThrow(() => trackAnalytics('profile_created'));
    assert.doesNotThrow(() => capturePageview('/profile/[profileHandle]'));
    assert.doesNotThrow(() => identifyAnalytics('account-id'));
    assert.doesNotThrow(() => clearAnalytics());
  });
});
