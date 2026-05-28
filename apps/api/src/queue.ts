import { connectQueue, ensureJobStream, loadQueueConfig, publishJob } from '@kosmo/core/queue';
import type {
  JobDefinition,
  PublishJobInput,
  QueueConfig,
  QueueConnection,
} from '@kosmo/core/queue';

export class ApiQueueProducer {
  readonly #config: QueueConfig;
  #connection: Promise<QueueConnection> | undefined;

  constructor(config = loadQueueConfig()) {
    this.#config = config;
  }

  async #getConnection() {
    this.#connection ??= connectQueue(this.#config).then(async (connection) => {
      await ensureJobStream(connection.manager, this.#config);

      return connection;
    });

    return this.#connection;
  }

  async publish<TPayload>(definition: JobDefinition<TPayload>, input: PublishJobInput<TPayload>) {
    const connection = await this.#getConnection();

    return publishJob(connection.jetstream, this.#config, definition, input);
  }
}

export const createApiQueueProducer = () => new ApiQueueProducer();
