import { createHash } from 'node:crypto';
import { createFedifyTemporalMessageEnvelope } from './message';
import type {
  MessageQueue,
  MessageQueueEnqueueOptions,
  MessageQueueListenOptions,
} from '@fedify/fedify';
import type { Client } from '@temporalio/client';
import type { FedifyTemporalMessageEnvelope } from './message';

type FedifyMessageHandler = (message: unknown) => Promise<void> | void;

const workflowScope = (taskQueue: string): string =>
  createHash('sha256').update(taskQueue).digest('hex').slice(0, 16);

const orderingKeyId = (orderingKey: string): string =>
  createHash('sha256').update(orderingKey).digest('hex');

/**
 * Fedify MessageQueue adapter backed by an application's existing Temporal
 * Client and task queue.
 *
 * The adapter only accepts/enqueues messages. The application owns the
 * Temporal Worker and binds the actual Fedify handler through `listen()`.
 */
export class TemporalFedifyQueue implements MessageQueue {
  /** Fedify delegates retries to the Temporal Activity retry policy. */
  readonly nativeRetrial = true;

  readonly #client: Client;
  readonly #taskQueue: string;
  readonly #scope: string;
  #resolveListening!: () => void;
  readonly listening: Promise<void>;
  #handler: FedifyMessageHandler | undefined;
  #stopListening: (() => void) | undefined;

  constructor(client: Client, taskQueue: string) {
    if (!taskQueue.trim()) {
      throw new TypeError('TemporalFedifyQueue taskQueue is required');
    }
    this.#client = client;
    this.#taskQueue = taskQueue;
    this.#scope = workflowScope(taskQueue);
    this.listening = new Promise<void>((resolve) => {
      this.#resolveListening = resolve;
    });
  }

  async enqueue(message: unknown, options: MessageQueueEnqueueOptions = {}): Promise<void> {
    const envelope = createFedifyTemporalMessageEnvelope(message, options);
    if (options.orderingKey === undefined) {
      await this.#client.workflow.start('fedifyMessageWorkflow', {
        args: [envelope],
        taskQueue: this.#taskQueue,
        workflowId: `fedify-temporal:${this.#scope}:message:${envelope.id}`,
      });
      return;
    }

    await this.#client.workflow.signalWithStart('fedifyKeyedMessageWorkflow', {
      args: [{ orderingKey: options.orderingKey }],
      signal: 'enqueue',
      signalArgs: [envelope],
      taskQueue: this.#taskQueue,
      workflowId: `fedify-temporal:${this.#scope}:key:${orderingKeyId(options.orderingKey)}`,
    });
  }

  /**
   * Bind the real Fedify `processQueuedTask` callback and wait until the app's
   * AbortSignal ends the binding. This deliberately does not await handler
   * execution or create a Worker.
   */
  listen(handler: FedifyMessageHandler, options: MessageQueueListenOptions = {}): Promise<void> {
    if (this.#handler !== undefined && this.#handler !== handler) {
      throw new Error('TemporalFedifyQueue.listen() was called with another handler');
    }
    this.#handler = handler;
    this.#resolveListening();

    if (options.signal?.aborted) {
      this.#handler = undefined;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const signal = options.signal;
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener('abort', finish);
        if (this.#stopListening === finish) {
          this.#stopListening = undefined;
        }
        if (this.#handler === handler) {
          this.#handler = undefined;
        }
        resolve();
      };
      this.#stopListening = finish;
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) {
        finish();
      }
    });
  }

  /** Activity entrypoint used by the application Worker registration. */
  async process(envelope: FedifyTemporalMessageEnvelope): Promise<void> {
    if (this.#handler === undefined) {
      throw new Error('TemporalFedifyQueue has no bound Fedify handler');
    }
    await this.#handler(envelope.message);
  }
}
