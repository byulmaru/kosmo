import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type {
  createFirstProfileOnboardingAnalytics,
  FirstProfileOnboardingAnalytics,
} from './firstProfileOnboardingAnalytics';

type CapturedEvent = {
  accountId: string;
  event: string;
  properties: Record<string, unknown>;
};

const events: CapturedEvent[] = [];
const pendingHomeViews: Array<{ accountId: string | null; flowId: string | null }> = [];
mock.module('@/analytics/client', {
  exports: {
    trackAnalyticsForAccount: (
      accountId: string,
      event: string,
      properties: Record<string, unknown>,
    ) => events.push({ accountId, event, properties }),
    setPendingOnboardingHomeView: (accountId: string | null, flowId: string | null) =>
      pendingHomeViews.push({ accountId, flowId }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let createAnalytics: typeof createFirstProfileOnboardingAnalytics;

before(async () => {
  ({ createFirstProfileOnboardingAnalytics: createAnalytics } =
    await import('./firstProfileOnboardingAnalytics'));
});

beforeEach(() => {
  events.length = 0;
  pendingHomeViews.length = 0;
});

describe('first-profile onboarding analytics state', () => {
  it('records accepted actions and one terminal result per operation attempt', () => {
    const analytics = createAnalytics('account-a');
    analytics.viewStep('handle');
    const actionSequence = analytics.action('handle', 'next');
    const failedCreate = analytics.beginOperation('handle', 'create_profile', actionSequence);
    analytics.finishOperation(failedCreate, 'failed', 'network');

    const retrySequence = analytics.action('handle', 'next');
    const successfulCreate = analytics.beginOperation('handle', 'create_profile', retrySequence);
    analytics.profileCreated('created-profile', successfulCreate);
    analytics.profileCreated('created-profile', successfulCreate);
    analytics.finishOperation(successfulCreate, 'succeeded');
    const selection = analytics.beginOperation('handle', 'select_profile', retrySequence);
    analytics.profileSelected('created-profile', selection);
    analytics.profileSelected('created-profile', selection);
    analytics.finishOperation(selection, 'succeeded');

    const createOperations = events.filter(
      ({ event, properties }) =>
        event === 'first_profile_onboarding_operation' && properties.operation === 'create_profile',
    );
    assert.deepEqual(
      createOperations.map(({ properties }) => [properties.result, properties.operation_attempt]),
      [
        ['failed', 1],
        ['succeeded', 2],
      ],
    );
    assert.equal(events.filter(({ event }) => event === 'profile_created').length, 1);
    assert.equal(events.filter(({ event }) => event === 'profile_selected').length, 1);
    assert.equal(events[0]?.accountId, 'account-a');
    assert.equal(
      events.filter(({ event }) => event === 'first_profile_onboarding_started').length,
      1,
    );
  });

  it('keeps saved-tag knowledge and freezes one completion snapshot with unique user follow state', () => {
    const analytics = createAnalytics('account-b');
    const firstTagLoad = analytics.beginOperation('discovery', 'load_saved_tags');
    analytics.savedTagsLoaded(firstTagLoad, 3);
    const failedRefresh = analytics.beginOperation('discovery', 'load_saved_tags');
    analytics.savedTagsFailed(failedRefresh, 'network');

    const follow = analytics.follow.begin('target-a', 'follow');
    analytics.follow.finish(follow, 'target-a', 'relationship', 'selected-profile');
    const unfollow = analytics.follow.begin('target-a', 'unfollow');
    analytics.follow.finish(unfollow, 'target-a', 'removed', 'selected-profile');
    const refollow = analytics.follow.begin('target-a', 'follow');
    analytics.follow.finish(refollow, 'target-a', 'relationship', 'selected-profile');
    const request = analytics.follow.begin('target-b', 'follow');
    analytics.follow.finish(request, 'target-b', 'request', 'selected-profile');
    const cancel = analytics.follow.begin('target-b', 'cancel_request');
    analytics.follow.finish(cancel, 'target-b', 'removed', 'selected-profile');
    const pendingFollow = analytics.follow.begin('target-c', 'follow');

    analytics.completeOnboarding('continued');
    analytics.follow.finish(pendingFollow, 'target-c', 'request', 'selected-profile');
    analytics.completeOnboarding('no_saved_tags');

    const completion = events.find(({ event }) => event === 'first_profile_onboarding_completed');
    assert.equal(completion?.properties.saved_tag_count_status, 'known');
    assert.equal(completion?.properties.saved_tag_count, 3);
    assert.equal(completion?.properties.follow_relationship_count, 1);
    assert.equal(completion?.properties.follow_request_count, 0);
    assert.equal(completion?.properties.follow_operation_pending_count, 1);
    assert.equal(completion?.properties.operation_pending_count, 1);
    assert.equal(
      events.filter(({ event }) => event === 'first_profile_onboarding_completed').length,
      1,
    );
    assert.equal(events.filter(({ event }) => event === 'follow_succeeded').length, 4);
    assert.equal(
      events
        .filter(({ event }) => event === 'follow_succeeded')
        .every(({ properties }) => !Object.values(properties).includes('target-a')),
      true,
    );
    assert.deepEqual(pendingHomeViews, [
      { accountId: 'account-b', flowId: completion?.properties.flow_id as string },
    ]);
  });

  it('marks a never-loaded saved-tag count unknown and does not reuse tag identity', () => {
    const analytics: FirstProfileOnboardingAnalytics = createAnalytics('account-c');
    const savedTags = analytics.beginOperation('discovery', 'load_saved_tags');
    const tagActionSequence = analytics.action('discovery', 'select_tag', 1);
    analytics.completeOnboarding('continued');
    analytics.savedTagsFailed(savedTags, 'response');

    const completion = events.find(({ event }) => event === 'first_profile_onboarding_completed');
    const tagAction = events.find(({ event }) => event === 'first_profile_onboarding_action');
    assert.equal(completion?.properties.saved_tag_count_status, 'unknown');
    assert.equal(completion?.properties.operation_pending_count, 1);
    assert.equal(tagAction?.properties.action_sequence, tagActionSequence);
    assert.equal(tagAction?.properties.tag_index, 1);
    assert.equal('tag_id' in (tagAction?.properties ?? {}), false);
    assert.equal('tag_name' in (tagAction?.properties ?? {}), false);
  });
});
