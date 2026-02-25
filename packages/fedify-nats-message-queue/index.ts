import { AckPolicy, DeliverPolicy } from '@nats-io/jetstream';
import type {
  MessageQueue,
  MessageQueueEnqueueOptions,
  MessageQueueListenOptions,
} from '@fedify/fedify';
import type { JetStreamClient } from '@nats-io/jetstream';

type QueueMessage = unknown;

interface NatsMessageQueueOptions {
  js: JetStreamClient;
  streamName: string;
  subject: string;
  consumerName?: string;
  maxDeliver?: number;
}

export class NatsMessageQueue implements MessageQueue {
  readonly nativeRetrial = true;

  #js: JetStreamClient;
  #streamName: string;
  #subject: string;
  #consumerName: string;
  #maxDeliver: number;

  constructor(options: NatsMessageQueueOptions) {
    this.#js = options.js;
    this.#streamName = options.streamName;
    this.#subject = options.subject;
    this.#consumerName = options.consumerName ?? 'fedify-worker';
    this.#maxDeliver = options.maxDeliver ?? 20;
  }

  async enqueue(message: QueueMessage, options?: MessageQueueEnqueueOptions): Promise<void> {
    if (options?.delay) {
      const delayMs = options.delay.total('millisecond');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await this.#js.publish(this.#subject, JSON.stringify(message));
  }

  async listen(
    handler: (message: QueueMessage) => Promise<void> | void,
    options?: MessageQueueListenOptions,
  ): Promise<void> {
    const signal = options?.signal;

    const jsm = await this.#js.jetstreamManager();
    await jsm.consumers.add(this.#streamName, {
      durable_name: this.#consumerName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      max_deliver: this.#maxDeliver,
    });

    const consumer = await this.#js.consumers.get(this.#streamName, this.#consumerName);
    const decoder = new TextDecoder();

    while (!signal?.aborted) {
      try {
        const messages = await consumer.consume();

        signal?.addEventListener(
          'abort',
          () => {
            messages.stop();
          },
          { once: true },
        );

        for await (const m of messages) {
          if (signal?.aborted) {
            break;
          }
          try {
            const payload = JSON.parse(decoder.decode(m.data));
            await handler(payload);
            m.ack();
          } catch {
            m.nak();
          }
        }
      } catch {
        if (signal?.aborted) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}
