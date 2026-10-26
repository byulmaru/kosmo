import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getConfig, getLogger } from '@logtape/logtape';
import { configureFedifyInboxLogging } from './logging';

test('projects sampled Fedify inbox records into safe JSON logs', (t) => {
  const output: string[] = [];
  let random = 0.009;
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(String(args[0])));
  t.mock.method(Math, 'random', () => random);

  configureFedifyInboxLogging();
  const logger = getLogger(['fedify', 'federation', 'inbox']);
  logger.info('Activity {activityId} is enqueued.', {
    activityId: 'https://remote.example/activities/queued?secret=activity-query',
  });
  logger.info('Activity {activityId} has been processed.', {
    activityId: 'https://remote.example/activities/processed?secret=activity-query',
  });

  random = 0.01;
  logger.info('Activity {activityId} is enqueued.', {
    activityId: 'https://remote.example/activities/sampled-out',
  });
  logger.debug('debug body canary');
  logger.warn('Unknown warning template {value}', { value: 'warning property canary' });
  logger.error('Unknown error template {value}', { value: 'error property canary' });
  logger.fatal('Unknown fatal template {value}', { value: 'fatal property canary' });
  logger.error("Failed to verify the request's HTTP Signatures.", {
    keyId: 'https://user:password@keys.example/key?secret=key-query',
    reason: 'invalidSignature',
    recipient: 'recipient-private',
    signature: 'signature-private',
  });
  logger.error('Unknown private error template {body}', {
    activity: { body: 'activity-body-private' },
    body: 'raw-message-private',
    error: new Error('raw-error-private'),
  });

  const records = output.map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(
    records.slice(0, 2).map(({ event, activityOriginClaimed }) => ({
      activityOriginClaimed,
      event,
    })),
    [
      { activityOriginClaimed: 'https://remote.example', event: 'activity_enqueued' },
      { activityOriginClaimed: 'https://remote.example', event: 'activity_processed' },
    ],
  );
  assert.notEqual(records[0]?.event, records[1]?.event);
  assert.deepEqual(
    records.slice(2, 5).map(({ level }) => level),
    ['warning', 'error', 'fatal'],
  );
  assert.deepEqual(records[5], {
    authReason: 'invalidSignature',
    category: ['fedify', 'federation', 'inbox'],
    event: 'signature_verification_failed',
    keyOriginUnverified: 'https://keys.example',
    level: 'error',
    message: 'Fedify could not verify an inbox signature.',
    timestamp: records[5]?.timestamp,
  });
  assert.deepEqual(Object.keys(records[6] ?? {}).sort(), [
    'category',
    'event',
    'level',
    'timestamp',
  ]);
  assert.doesNotMatch(
    output.join('\n'),
    /activity-query|sampled-out|debug body|private|key-query/u,
  );
});

test('configuration is idempotent and leaves the existing owner untouched', () => {
  const config = getConfig();
  configureFedifyInboxLogging();
  assert.equal(getConfig(), config);
});
