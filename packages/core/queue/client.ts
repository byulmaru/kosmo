import {
  AckPolicy,
  connect,
  DeliverPolicy,
  DiscardPolicy,
  headers,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
} from 'nats';
import { jobSubject, jobSubjectPattern, msToNanos, requireNatsUrl } from './config';
import { jobEnvelopeSchema } from './types';
import type { Consumer, JetStreamClient, JetStreamManager, JsMsg, NatsConnection } from 'nats';
import type { QueueConfig } from './config';
import type { JobRegistry } from './registry';
import type {
  JobDefinition,
  JobEnvelope,
  JobHandlerContext,
  PublishJobInput,
  PublishJobResult,
  QueueLogger,
} from './types';

const textEncoder = new TextEncoder();

export type QueueConnection = {
  jetstream: JetStreamClient;
  manager: JetStreamManager;
  nats: NatsConnection;
};

export const connectQueue = async (config: QueueConfig): Promise<QueueConnection> => {
  const nats = await connect({ servers: requireNatsUrl(config) });
  const manager = await nats.jetstreamManager();

  return {
    jetstream: manager.jetstream(),
    manager,
    nats,
  };
};

export const ensureJobStream = async (manager: JetStreamManager, config: QueueConfig) => {
  const streamConfig = {
    discard: DiscardPolicy.Old,
    duplicate_window: msToNanos(120_000),
    max_age: 0,
    max_bytes: -1,
    max_consumers: -1,
    max_msg_size: -1,
    max_msgs: -1,
    max_msgs_per_subject: -1,
    name: config.streamName,
    retention: RetentionPolicy.Workqueue,
    storage: StorageType.File,
    subjects: [jobSubjectPattern(config)],
  };

  try {
    const info = await manager.streams.info(config.streamName);
    await manager.streams.update(config.streamName, streamConfig);
    return info;
  } catch {
    return manager.streams.add(streamConfig);
  }
};

export const ensureJobConsumer = async (manager: JetStreamManager, config: QueueConfig) => {
  const consumerConfig = {
    ack_policy: AckPolicy.Explicit,
    ack_wait: msToNanos(config.ackWaitMs),
    deliver_policy: DeliverPolicy.All,
    durable_name: config.consumerName,
    filter_subject: jobSubjectPattern(config),
    max_ack_pending: config.workerConcurrency,
    max_deliver: config.maxDeliver,
    name: config.consumerName,
    replay_policy: ReplayPolicy.Instant,
  };

  try {
    await manager.consumers.info(config.streamName, config.consumerName);
    return manager.consumers.update(config.streamName, config.consumerName, consumerConfig);
  } catch {
    return manager.consumers.add(config.streamName, consumerConfig);
  }
};

export const createJobId = () => crypto.randomUUID();

export const publishJob = async <TPayload>(
  jetstream: JetStreamClient,
  config: QueueConfig,
  definition: JobDefinition<TPayload>,
  input: PublishJobInput<TPayload>,
): Promise<PublishJobResult> => {
  const payload = definition.payloadSchema.parse(input.payload);
  const jobId = input.id ?? createJobId();
  const envelope: JobEnvelope = {
    enqueuedAt: new Date().toISOString(),
    id: jobId,
    payload,
    traceId: input.traceId,
    type: definition.type,
    version: definition.version,
  };
  const messageHeaders = headers();

  messageHeaders.set('Nats-Msg-Id', jobId);

  const ack = await jetstream.publish(
    jobSubject(config, definition.subject),
    textEncoder.encode(JSON.stringify(envelope)),
    {
      headers: messageHeaders,
      msgID: jobId,
      timeout: config.publishTimeoutMs,
    },
  );

  return {
    duplicate: ack.duplicate,
    jobId,
    seq: ack.seq,
    stream: ack.stream,
  };
};

export type RunJobConsumerOptions = {
  logger?: QueueLogger;
  signal?: AbortSignal;
};

const log = (
  logger: QueueLogger,
  level: keyof QueueLogger,
  event: string,
  fields: Record<string, unknown>,
) => {
  logger[level](JSON.stringify({ event, ...fields }));
};

const parseEnvelope = (message: JsMsg) => {
  const body = new TextDecoder().decode(message.data);

  return jobEnvelopeSchema.parse(JSON.parse(body));
};

const createHandlerContext = (message: JsMsg, envelope: JobEnvelope): JobHandlerContext => ({
  deliveryCount: message.info.deliveryCount,
  enqueuedAt: envelope.enqueuedAt,
  jobId: envelope.id,
  jobType: envelope.type,
  redelivered: message.redelivered,
  subject: message.subject,
});

const handleMessage = async (
  message: JsMsg,
  registry: JobRegistry,
  config: QueueConfig,
  logger: QueueLogger,
) => {
  try {
    const envelope = parseEnvelope(message);
    const definition = registry.get(envelope.type);
    const handler = registry.getHandler(envelope.type);
    const context = createHandlerContext(message, envelope);

    if (!definition || !handler) {
      log(logger, 'error', 'job_unknown_type', context);
      message.nak();
      return;
    }

    if (definition.version !== envelope.version) {
      log(logger, 'error', 'job_unsupported_version', {
        ...context,
        expectedVersion: definition.version,
        version: envelope.version,
      });
      message.nak();
      return;
    }

    const payload = definition.payloadSchema.parse(envelope.payload);

    await handler(payload, context);
    message.ack();
  } catch (error) {
    const deliveryCount = message.info.deliveryCount;
    const event =
      deliveryCount >= config.maxDeliver ? 'job_terminal_failure' : 'job_retryable_failure';

    log(logger, 'error', event, {
      deliveryCount,
      error: error instanceof Error ? error.message : String(error),
      redelivered: message.redelivered,
      subject: message.subject,
    });
    message.nak();
  }
};

export const runJobConsumer = async (
  consumer: Consumer,
  registry: JobRegistry,
  config: QueueConfig,
  options: RunJobConsumerOptions = {},
) => {
  const logger = options.logger ?? console;
  const messages = await consumer.consume({
    max_messages: config.workerConcurrency,
  });
  const running = new Set<Promise<void>>();

  options.signal?.addEventListener('abort', () => {
    void messages.close();
  });

  for await (const message of messages) {
    const task = handleMessage(message, registry, config, logger).finally(() => {
      running.delete(task);
    });

    running.add(task);

    if (running.size >= config.workerConcurrency) {
      await Promise.race(running);
    }
  }

  await Promise.allSettled(running);
};
