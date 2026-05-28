import { z } from 'zod';

export const defaultQueueConfig = {
  ackWaitMs: 30_000,
  consumerName: 'kosmo-worker',
  maxDeliver: 5,
  publishTimeoutMs: 5_000,
  streamName: 'KOSMO_JOBS',
  subjectPrefix: 'kosmo.jobs',
  workerConcurrency: 4,
} as const;

export class QueueConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueConfigError';
  }
}

const integerEnvSchema = (name: string, defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') {
        return defaultValue;
      }

      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new QueueConfigError(`${name} must be a positive integer`);
      }

      return parsed;
    });

const optionalStringEnvSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  });

const queueEnvSchema = z.object({
  JOB_ACK_WAIT_MS: integerEnvSchema('JOB_ACK_WAIT_MS', defaultQueueConfig.ackWaitMs),
  JOB_CONSUMER_NAME: optionalStringEnvSchema,
  JOB_MAX_DELIVER: integerEnvSchema('JOB_MAX_DELIVER', defaultQueueConfig.maxDeliver),
  JOB_PUBLISH_TIMEOUT_MS: integerEnvSchema(
    'JOB_PUBLISH_TIMEOUT_MS',
    defaultQueueConfig.publishTimeoutMs,
  ),
  JOB_STREAM_NAME: optionalStringEnvSchema,
  JOB_SUBJECT_PREFIX: optionalStringEnvSchema,
  JOB_WORKER_CONCURRENCY: integerEnvSchema(
    'JOB_WORKER_CONCURRENCY',
    defaultQueueConfig.workerConcurrency,
  ),
  NATS_URL: optionalStringEnvSchema,
});

export type QueueConfig = {
  ackWaitMs: number;
  consumerName: string;
  maxDeliver: number;
  natsUrl?: string;
  publishTimeoutMs: number;
  streamName: string;
  subjectPrefix: string;
  workerConcurrency: number;
};

export const loadQueueConfig = (
  env: NodeJS.ProcessEnv = process.env,
  options: { requireNatsUrl?: boolean } = {},
): QueueConfig => {
  const parsed = queueEnvSchema.parse(env);

  if (options.requireNatsUrl && !parsed.NATS_URL) {
    throw new QueueConfigError('NATS_URL is required');
  }

  return {
    ackWaitMs: parsed.JOB_ACK_WAIT_MS,
    consumerName: parsed.JOB_CONSUMER_NAME ?? defaultQueueConfig.consumerName,
    maxDeliver: parsed.JOB_MAX_DELIVER,
    natsUrl: parsed.NATS_URL,
    publishTimeoutMs: parsed.JOB_PUBLISH_TIMEOUT_MS,
    streamName: parsed.JOB_STREAM_NAME ?? defaultQueueConfig.streamName,
    subjectPrefix: parsed.JOB_SUBJECT_PREFIX ?? defaultQueueConfig.subjectPrefix,
    workerConcurrency: parsed.JOB_WORKER_CONCURRENCY,
  };
};

export const requireNatsUrl = (config: QueueConfig) => {
  if (!config.natsUrl) {
    throw new QueueConfigError('NATS_URL is required');
  }

  return config.natsUrl;
};

export const jobSubject = (config: Pick<QueueConfig, 'subjectPrefix'>, suffix: string) =>
  `${config.subjectPrefix}.${suffix}`;

export const jobSubjectPattern = (config: Pick<QueueConfig, 'subjectPrefix'>) =>
  `${config.subjectPrefix}.*`;

export const msToNanos = (milliseconds: number) => milliseconds * 1_000_000;
