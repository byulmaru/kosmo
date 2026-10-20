import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Create } from '@fedify/vocab';
import {
  hasInboundErrorBeenObserved,
  isExternalInboundError,
  markInboundErrorObserved,
  observeInbound,
  setInboundObservabilityReporter,
  withInboundObservability,
} from './inbound-observability';

describe('inbound ActivityPub observability', () => {
  test('retains the object URI in structured logs and keeps Sentry context bounded', () => {
    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
      captureException: (error, context) => captures.push({ context, error }),
    });

    try {
      const error = new Error('projection failed');
      observeInbound({
        activityType: 'Create',
        actorOrigin: 'https://remote.example/users/alice',
        activityOrigin: 'https://remote.example/activities/1?secret=1',
        error,
        handler: 'create',
        objectOrigin: 'https://remote.example/notes/1',
        objectUri: 'https://remote.example/notes/1?revision=2',
        outcome: 'internal_failure',
        phase: 'projection',
        reasonCode: 'post_commit_projection_failed',
      });

      assert.deepEqual(logs, [
        {
          activityType: 'Create',
          actorOrigin: 'https://remote.example',
          activityOrigin: 'https://remote.example',
          handler: 'create',
          objectOrigin: 'https://remote.example',
          objectUri: 'https://remote.example/notes/1?revision=2',
          outcome: 'internal_failure',
          phase: 'projection',
          reasonCode: 'post_commit_projection_failed',
        },
      ]);
      assert.deepEqual(captures, [
        {
          context: {
            extra: {
              activity_origin: 'https://remote.example',
              actor_origin: 'https://remote.example',
              object_origin: 'https://remote.example',
            },
            fingerprint: [
              'activitypub-inbound',
              'Create',
              'create',
              'projection',
              'post_commit_projection_failed',
            ],
            tags: {
              activity_type: 'Create',
              handler: 'create',
              outcome: 'internal_failure',
              phase: 'projection',
              reason_code: 'post_commit_projection_failed',
            },
          },
          error,
        },
      ]);

      observeInbound({
        activityType: 'Create',
        handler: 'create',
        objectOrigin: 'remote.example/notes/2?token=private',
        objectUri: 'https://remote.example/notes/2?revision=2',
        outcome: 'internal_failure',
        phase: 'projection',
        reasonCode: 'invalid_object_origin',
      });

      assert.deepEqual(logs[1], {
        activityType: 'Create',
        handler: 'create',
        objectUri: 'https://remote.example/notes/2?revision=2',
        outcome: 'internal_failure',
        phase: 'projection',
        reasonCode: 'invalid_object_origin',
      });
      assert.deepEqual(
        (captures[1] as { context: { extra: Record<string, string> } }).context.extra,
        {},
      );
    } finally {
      restore();
    }
  });

  test('logs a rejected Note URI with its reason through the default warning reporter', (t) => {
    const warnings: unknown[][] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => warnings.push(args));

    observeInbound({
      activityType: 'Create',
      handler: 'create',
      objectUri: 'https://remote.example/notes/direct?revision=2',
      outcome: 'rejected',
      phase: 'validation',
      reasonCode: 'no_active_local_mention',
    });

    assert.deepEqual(warnings, [
      [
        'ActivityPub inbound observation',
        {
          activityType: 'Create',
          handler: 'create',
          objectOrigin: 'https://remote.example',
          objectUri: 'https://remote.example/notes/direct?revision=2',
          outcome: 'rejected',
          phase: 'validation',
          reasonCode: 'no_active_local_mention',
        },
      ],
    ]);
  });

  test('does not capture expected or external failures', () => {
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      log: () => undefined,
      captureException: (error) => captures.push(error),
    });

    try {
      observeInbound({
        activityType: 'Accept',
        handler: 'accept',
        outcome: 'external_failure',
        phase: 'object_lookup',
        reasonCode: 'accept_object_lookup_failed',
      });
      observeInbound({
        activityType: 'Accept',
        handler: 'accept',
        outcome: 'rejected',
        phase: 'validation',
        reasonCode: 'invalid_actor_identity',
      });
      assert.equal(captures.length, 0);
    } finally {
      restore();
    }
  });

  test('records one bounded metric for a note content length rejection', () => {
    const metrics: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      countMetric: (name, attributes) => metrics.push({ attributes, name }),
      log: () => undefined,
    });

    try {
      observeInbound({
        activityType: 'Create',
        actorOrigin: 'https://remote.example/users/alice',
        handler: 'create',
        objectOrigin: 'https://remote.example/notes/1',
        objectUri: 'https://remote.example/notes/1?revision=2',
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'note_content_length_exceeded',
      });

      assert.deepEqual(metrics, [
        {
          attributes: {
            activity_type: 'Create',
            handler: 'create',
            outcome: 'rejected',
            phase: 'projection',
            reason_code: 'note_content_length_exceeded',
          },
          name: 'activitypub.inbound.note_content_length_exceeded',
        },
      ]);
      assert.doesNotMatch(JSON.stringify(metrics), /remote\.example|notes\/1/u);
    } finally {
      restore();
    }
  });

  test('ignores metric backend failures', () => {
    const restore = setInboundObservabilityReporter({
      countMetric: () => {
        throw new Error('metric backend failed');
      },
      log: () => undefined,
    });

    try {
      assert.doesNotThrow(() =>
        observeInbound({
          activityType: 'Create',
          handler: 'create',
          outcome: 'rejected',
          phase: 'projection',
          reasonCode: 'note_content_length_exceeded',
        }),
      );
    } finally {
      restore();
    }
  });

  test('listener wrapper logs the exact object URI for internal errors and rethrows', async () => {
    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
      captureException: (error, context) => captures.push({ error, context }),
    });

    try {
      const error = new Error('database failed');
      const objectUri = new URL('https://remote.example/notes/1?revision=2');
      const listener = withInboundObservability('create', async () => {
        throw error;
      });

      await assert.rejects(() => listener({} as never, new Create({ object: objectUri })), error);
      assert.deepEqual(logs, [
        {
          activityType: 'Create',
          handler: 'create',
          objectOrigin: objectUri.origin,
          objectUri: objectUri.href,
          outcome: 'internal_failure',
          phase: 'listener',
          reasonCode: 'unexpected_listener_error',
        },
      ]);
      assert.equal(captures.length, 1);
      assert.equal(hasInboundErrorBeenObserved(error), true);
      assert.equal(
        (captures[0] as { context: { tags: { activity_type: string } } }).context.tags
          .activity_type,
        'Create',
      );
      assert.deepEqual(
        (captures[0] as { context: { extra: Record<string, string> } }).context.extra,
        { object_origin: objectUri.origin },
      );
    } finally {
      restore();
    }
  });

  test('recognizes remote failures and tracks observed error identity', () => {
    const error = new Error('remote failed');
    error.name = 'FetchError';
    assert.equal(isExternalInboundError(error), true);
    assert.equal(hasInboundErrorBeenObserved(error), false);
    markInboundErrorObserved(error);
    assert.equal(hasInboundErrorBeenObserved(error), true);
  });

  test('does not infer a remote failure from a generic socket code', () => {
    const error = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });

    assert.equal(isExternalInboundError(error), false);
  });
});
