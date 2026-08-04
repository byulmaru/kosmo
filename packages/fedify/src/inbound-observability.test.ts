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
  test('captures only bounded internal metadata and strips URI paths', () => {
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
    } finally {
      restore();
    }
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

  test('listener wrapper reports internal errors once and rethrows', async () => {
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      log: () => undefined,
      captureException: (error, context) => captures.push({ error, context }),
    });

    try {
      const error = new Error('database failed');
      const listener = withInboundObservability('create', async () => {
        throw error;
      });

      await assert.rejects(() => listener({} as never, new Create({})), error);
      assert.equal(captures.length, 1);
      assert.equal(hasInboundErrorBeenObserved(error), true);
      assert.equal(
        (captures[0] as { context: { tags: { activity_type: string } } }).context.tags
          .activity_type,
        'Create',
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
