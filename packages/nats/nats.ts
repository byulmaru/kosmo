import { env } from '@kosmo/env';
import { DiscardPolicy, jetstream, RetentionPolicy } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import type { JetStreamClient } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';

export const nc: NatsConnection = await connect({
  servers: env.NATS_URL,
  reconnect: true,
  maxReconnectAttempts: -1,
});

export const js: JetStreamClient = jetstream(nc);
export const streamName = 'jobs';

const jsm = await js.jetstreamManager();

await jsm.streams.add({
  name: streamName,
  subjects: ['*'],
  retention: RetentionPolicy.Workqueue,
  discard: DiscardPolicy.New,
});
