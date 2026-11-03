import { createPubSub } from '@graphql-yoga/subscription';
import { disposeRedisPubSub, redisEventTarget } from './pubsub.ts';

type Events = {
  'test:redis:event': [id: string, payload: { value: string }];
  'test:redis:other': [id: string, payload: { value: string }];
};

type Command = { type: 'publish-other'; requestId: string; value: string } | { type: 'dispose' };

const id = process.env.KOSMO_PUBSUB_TEST_ID;
if (id === undefined) {
  throw new Error('KOSMO_PUBSUB_TEST_ID is required');
}

const pubSub = createPubSub<Events>({ eventTarget: redisEventTarget });
const iterators = new Map<string, AsyncIterableIterator<unknown>>();

function send(message: unknown): void {
  process.send?.(message);
}

function watch(name: string, iterator: AsyncIterableIterator<unknown>): void {
  iterators.set(name, iterator);
  void (async () => {
    for await (const value of iterator) {
      send({ type: 'event', name, value });
    }
  })().catch((error: unknown) => {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  });
}

watch('event', pubSub.subscribe('test:redis:event', id));
send({ type: 'ready' });

process.on('message', (command: Command) => {
  void (async () => {
    switch (command.type) {
      case 'publish-other':
        pubSub.publish('test:redis:other', id, { value: command.value });
        send({ type: 'published', requestId: command.requestId });
        break;
      case 'dispose':
        await Promise.all([...iterators.values()].map((iterator) => iterator.return?.()));
        disposeRedisPubSub();
        disposeRedisPubSub();
        send({ type: 'disposed' });
        setTimeout(() => process.disconnect?.(), 10);
        break;
    }
  })().catch((error: unknown) => {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  });
});
