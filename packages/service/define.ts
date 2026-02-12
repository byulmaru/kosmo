import { js } from '@kosmo/nats';
import { headers } from '@nats-io/transport-node';
import type { MsgHdrs } from '@nats-io/transport-node';

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
    defaultQueueOptions?: { deduplication?: DeduplicationOptions<Input> };
  },
) => {
  jobs.set(name, fn);
  return {
    call: (input: Input) => fn(input),
    queue: async (input: Input, queueOptions?: { deduplication?: DeduplicationOptions<Input> }) => {
      let msgHeaders: MsgHdrs | undefined;
      const deduplicationIdRaw =
        options?.defaultQueueOptions?.deduplication?.id ?? queueOptions?.deduplication?.id;

      if (deduplicationIdRaw) {
        const id =
          typeof deduplicationIdRaw === 'string' ? deduplicationIdRaw : deduplicationIdRaw(input);
        msgHeaders = headers();
        msgHeaders.set('Nats-Msg-Id', id);
      }

      await js.publish(name, JSON.stringify(input), { headers: msgHeaders });
    },

    queueBulk: async (
      input: Input[] | Iterable<Input>,
      queueOptions?: { deduplication?: DeduplicationOptions<Input> },
    ) => {
      const inputs = Array.isArray(input) ? input : Array.from(input);
      await Promise.all(
        inputs.map(async (data) => {
          let msgHeaders: MsgHdrs | undefined;
          const deduplicationIdRaw =
            options?.defaultQueueOptions?.deduplication?.id ?? queueOptions?.deduplication?.id;

          if (deduplicationIdRaw) {
            const id =
              typeof deduplicationIdRaw === 'string'
                ? deduplicationIdRaw
                : deduplicationIdRaw(data);
            msgHeaders = headers();
            msgHeaders.set('Nats-Msg-Id', id);
          }

          await js.publish(name, JSON.stringify(data), { headers: msgHeaders });
        }),
      );
    },
  };
};
