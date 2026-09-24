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
    exploration.beginProfileHashtagExploration('hashtag-a');
    const session = exploration.consumeProfileHashtagExploration('hashtag-a');
    assert.ok(session);

    const tracker = exploration.createProfileHashtagExplorationTracker(session);
    tracker.recordInitialResults(true);
    tracker.recordInitialResults(false);
    tracker.recordPaginationFailure();
    tracker.recordResultSelected();
    tracker.recordResultSelected();
    tracker.end();
    tracker.end();

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
    exploration.beginProfileHashtagExploration('hashtag-b');
    const session = exploration.consumeProfileHashtagExploration('hashtag-b');
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

  it('persists only external navigation context and consumes it once', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: storage,
    });

    try {
      exploration.beginProfileHashtagExploration('hashtag-external', {
        persistForExternal: true,
      });
      const session = exploration.consumeProfileHashtagExploration('hashtag-external');

      assert.ok(session);
      assert.equal(exploration.consumeProfileHashtagExploration('hashtag-external'), null);
      assert.deepEqual(JSON.parse(values.values().next().value ?? '{}'), {});
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, 'sessionStorage', previous);
      } else {
        Reflect.deleteProperty(globalThis, 'sessionStorage');
      }
    }
  });
});
