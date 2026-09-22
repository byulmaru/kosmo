import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type * as ProfileHashtagExplorationModule from './profileHashtagExploration';

const calls: Array<readonly [string, Record<string, unknown>]> = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(new URL('./client.ts', import.meta.url), {
  trackAnalytics: (...args: readonly [string, Record<string, unknown>]) => calls.push(args),
});

let exploration: typeof ProfileHashtagExplorationModule;

before(async () => {
  exploration = await import('./profileHashtagExploration');
});

afterEach(() => {
  calls.length = 0;
});

describe('Profile hashtag exploration analytics', () => {
  it('accepted entry connects one session across results, pagination, selection, and exit', () => {
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-a');
    const session = exploration.consumeProfileHashtagExploration('account-a', 'hashtag-a');
    assert.ok(session);

    const tracker = exploration.createProfileHashtagExplorationTracker(session);
    tracker.recordInitialResults(true);
    tracker.recordInitialResults(false);
    tracker.recordPaginationFailure();
    tracker.recordResultSelected();
    tracker.recordResultSelected();
    tracker.end();
    tracker.end();
    tracker.recordInitialFailure();
    tracker.recordInitialResults(false);
    tracker.recordPaginationFailure();
    tracker.recordResultSelected();

    assert.deepEqual(
      calls.map(([event, properties]) => ({ event, properties })),
      [
        {
          event: 'profile_hashtag_exploration_started',
          properties: {
            hashtag_id: 'hashtag-a',
            profile_tag_exploration_session_id: session.sessionId,
          },
        },
        {
          event: 'profile_hashtag_results_loaded',
          properties: {
            hashtag_id: 'hashtag-a',
            profile_tag_exploration_session_id: session.sessionId,
            result: 'has_results',
            stage: 'initial',
          },
        },
        {
          event: 'profile_hashtag_results_failed',
          properties: {
            hashtag_id: 'hashtag-a',
            profile_tag_exploration_session_id: session.sessionId,
            stage: 'pagination',
          },
        },
        {
          event: 'profile_hashtag_result_selected',
          properties: {
            hashtag_id: 'hashtag-a',
            profile_tag_exploration_session_id: session.sessionId,
          },
        },
        {
          event: 'profile_hashtag_exploration_ended',
          properties: {
            hashtag_id: 'hashtag-a',
            profile_tag_exploration_session_id: session.sessionId,
          },
        },
      ],
    );
  });

  it('retry success replaces an initial failure for the first result event', () => {
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-b');
    const session = exploration.consumeProfileHashtagExploration('account-a', 'hashtag-b');
    assert.ok(session);

    const tracker = exploration.createProfileHashtagExplorationTracker(session);
    tracker.recordInitialFailure();
    tracker.recordInitialResults(false);
    tracker.recordInitialFailure();

    assert.deepEqual(
      calls.map(([event, properties]) => ({ event, properties })),
      [
        {
          event: 'profile_hashtag_exploration_started',
          properties: {
            hashtag_id: 'hashtag-b',
            profile_tag_exploration_session_id: session.sessionId,
          },
        },
        {
          event: 'profile_hashtag_results_failed',
          properties: {
            hashtag_id: 'hashtag-b',
            profile_tag_exploration_session_id: session.sessionId,
            stage: 'initial',
          },
        },
        {
          event: 'profile_hashtag_results_loaded',
          properties: {
            hashtag_id: 'hashtag-b',
            profile_tag_exploration_session_id: session.sessionId,
            result: 'empty',
            stage: 'initial',
          },
        },
      ],
    );
  });

  it('omits an unconfirmed hashtag identity instead of sending a substitute', () => {
    const tracker = exploration.createProfileHashtagExplorationTracker({
      sessionId: 'session-without-hashtag',
    });
    tracker.recordInitialResults(true);

    assert.deepEqual(calls, [
      [
        'profile_hashtag_results_loaded',
        {
          profile_tag_exploration_session_id: 'session-without-hashtag',
          result: 'has_results',
          stage: 'initial',
        },
      ],
    ]);
  });

  it('hands external navigation context to the copied tab without leaving it in the source tab', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    const sourceValues = new Map<string, string>();
    const storage = (values: Map<string, string>) => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: storage(sourceValues),
    });

    try {
      exploration.beginProfileHashtagExploration('account-a', 'hashtag-external', {
        persistForExternal: true,
      });
      const destinationValues = new Map(sourceValues);

      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(JSON.parse(sourceValues.values().next().value ?? '{}'), {});
      assert.equal(
        exploration.consumeProfileHashtagExploration('account-a', 'hashtag-external'),
        null,
      );

      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: storage(destinationValues),
      });
      const session = exploration.consumeProfileHashtagExploration('account-a', 'hashtag-external');

      assert.ok(session);
      assert.equal(
        exploration.consumeProfileHashtagExploration('account-a', 'hashtag-external'),
        null,
      );
      assert.deepEqual(JSON.parse(destinationValues.values().next().value ?? '{}'), {});
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, 'sessionStorage', previous);
      } else {
        Reflect.deleteProperty(globalThis, 'sessionStorage');
      }
    }
  });

  it('keeps one tracker across a same-account remount and ends it after the route stays unmounted', async () => {
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-remount');
    const firstLease = exploration.acquireProfileHashtagExplorationTracker(
      'account-a',
      'hashtag-remount',
    );
    assert.ok(firstLease);
    firstLease.tracker.recordInitialFailure();
    firstLease.release();

    const secondLease = exploration.acquireProfileHashtagExplorationTracker(
      'account-a',
      'hashtag-remount',
    );
    assert.ok(secondLease);
    assert.equal(secondLease.tracker, firstLease.tracker);
    secondLease.tracker.recordInitialResults(true);
    secondLease.release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(
      calls.map(([event]) => event),
      [
        'profile_hashtag_exploration_started',
        'profile_hashtag_results_failed',
        'profile_hashtag_results_loaded',
        'profile_hashtag_exploration_ended',
      ],
    );
  });

  it('does not carry an active exploration into another account', async () => {
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-account-change');

    assert.equal(
      exploration.acquireProfileHashtagExplorationTracker('account-b', 'hashtag-account-change'),
      null,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      exploration.acquireProfileHashtagExplorationTracker('account-a', 'hashtag-account-change'),
      null,
    );

    assert.deepEqual(
      calls.map(([event]) => event),
      ['profile_hashtag_exploration_started'],
    );
  });

  it('ends active exploration and discards pending handoffs before an Account identity changes', () => {
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-active');
    const lease = exploration.acquireProfileHashtagExplorationTracker(
      'account-a',
      'hashtag-active',
    );
    assert.ok(lease);
    lease.tracker.recordInitialFailure();
    exploration.beginProfileHashtagExploration('account-a', 'hashtag-pending');

    exploration.endProfileHashtagExplorationsForAccount('account-a');

    assert.equal(
      exploration.acquireProfileHashtagExplorationTracker('account-a', 'hashtag-active'),
      null,
    );
    assert.equal(
      exploration.acquireProfileHashtagExplorationTracker('account-a', 'hashtag-pending'),
      null,
    );
    assert.deepEqual(
      calls.map(([event]) => event),
      [
        'profile_hashtag_exploration_started',
        'profile_hashtag_results_failed',
        'profile_hashtag_exploration_started',
        'profile_hashtag_exploration_ended',
        'profile_hashtag_exploration_ended',
      ],
    );

    lease.tracker.recordInitialResults(true);
    lease.tracker.recordPaginationFailure();
    lease.tracker.recordResultSelected();
    assert.equal(calls.length, 5);
  });
});
