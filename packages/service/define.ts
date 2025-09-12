import { queue } from '@kosmo/queue';
import * as I from 'iter-ops';
import type { JobsOptions } from 'bullmq';

type DeduplicationOptions<Input> = {
  id: string | ((input: Input) => string);
  extend?: boolean;
  replace?: boolean;
  ttl?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const jobs = new Map<string, (input: any) => Promise<unknown>>();

export const defineService = <Input, Output>(
  name: string,
  fn: (input: Input) => Promise<Output>,
  options?: {
    defaultQueueOptions?: { deduplication?: DeduplicationOptions<Input> } & Omit<
      JobsOptions,
      'deduplication'
    >;
  },
) => {
  jobs.set(name, fn);
  return {
    call: (input: Input) => fn(input),
    queue: async (input: Input, queueOptions?: JobsOptions) => {
      const deduplicationOptions = options?.defaultQueueOptions?.deduplication
        ? {
            ...options.defaultQueueOptions.deduplication,
            id:
              typeof options.defaultQueueOptions.deduplication.id === 'string'
                ? options.defaultQueueOptions.deduplication.id
                : options.defaultQueueOptions.deduplication.id(input),
          }
        : undefined;

      await queue.add(name, input, {
        removeOnComplete: true,
        removeOnFail: {
          age: 24 * 60 * 60,
          count: 10000,
        },
        ...options?.defaultQueueOptions,
        deduplication: deduplicationOptions,
        ...queueOptions,
      });
    },

    queueBulk: async (input: Input[] | Iterable<Input>, queueOptions?: JobsOptions) => {
      await queue.addBulk(
        I.pipe(
          input,
          I.map((data) => {
            const deduplicationOptions = options?.defaultQueueOptions?.deduplication
              ? {
                  ...options.defaultQueueOptions.deduplication,
                  id:
                    typeof options.defaultQueueOptions.deduplication.id === 'string'
                      ? options.defaultQueueOptions.deduplication.id
                      : options.defaultQueueOptions.deduplication.id(data),
                }
              : undefined;

            return {
              name,
              data,
              opts: {
                removeOnComplete: true,
                removeOnFail: {
                  age: 24 * 60 * 60,
                  count: 10000,
                },
                ...options?.defaultQueueOptions,
                deduplication: deduplicationOptions,
                ...queueOptions,
              },
            };
          }),
          I.toArray(),
        ).first!,
      );
    },
  };
};
