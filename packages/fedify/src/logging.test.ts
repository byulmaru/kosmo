import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getConfig, getLogger } from '@logtape/logtape';
import { configureFedifyInboxLogging } from './logging';

test('emits native JSON lines and samples only info records', (t) => {
  const output: string[] = [];
  let random = 0.009;
  const capture = (...args: unknown[]) => output.push(String(args[0]));
  t.mock.method(console, 'debug', capture);
  t.mock.method(console, 'info', capture);
  t.mock.method(console, 'warn', capture);
  t.mock.method(console, 'error', capture);
  t.mock.method(Math, 'random', () => random);

  configureFedifyInboxLogging();
  const logger = getLogger(['fedify', 'federation', 'inbox']);
  const activityId = 'https://remote.example/activities/queued?secret=activity-query';
  logger.info('Activity {activityId} is enqueued.', { activityId });

  random = 0.01;
  logger.info('Activity {activityId} is enqueued.', {
    activityId: 'https://remote.example/activities/sampled-out',
  });
  logger.debug('debug body');

  random = 0.5;
  logger.warn('Warning {value}', { value: 'warning property' });
  logger.error('Error {value}', { value: 'error property' });
  logger.fatal('Fatal {value}', { value: 'fatal property' });

  const records = output
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter(({ logger: category }) => category === 'fedify.federation.inbox');
  const timestamp = records[0]?.['@timestamp'];
  assert.equal(typeof timestamp, 'string');
  assert.ok(Number.isFinite(Date.parse(String(timestamp))));
  assert.deepEqual(
    records.map(({ level, message, logger: category, properties }) => ({
      category,
      level,
      message,
      properties,
    })),
    [
      {
        category: 'fedify.federation.inbox',
        level: 'INFO',
        message: `Activity "${activityId}" is enqueued.`,
        properties: { activityId },
      },
      {
        category: 'fedify.federation.inbox',
        level: 'WARN',
        message: 'Warning "warning property"',
        properties: { value: 'warning property' },
      },
      {
        category: 'fedify.federation.inbox',
        level: 'ERROR',
        message: 'Error "error property"',
        properties: { value: 'error property' },
      },
      {
        category: 'fedify.federation.inbox',
        level: 'FATAL',
        message: 'Fatal "fatal property"',
        properties: { value: 'fatal property' },
      },
    ],
  );
});

test('configuration is idempotent and leaves the existing owner untouched', () => {
  const config = getConfig();
  configureFedifyInboxLogging();
  assert.equal(getConfig(), config);
});
