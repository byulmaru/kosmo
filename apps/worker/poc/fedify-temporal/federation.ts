import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { Follow } from '@fedify/vocab';
import type { Federation } from '@fedify/fedify';
import type { TemporalFedifyQueue } from './queue';

export type FedifyTemporalFederationOptions = Readonly<{
  readonly origin?: string;
}>;

/**
 * Build a real Fedify Federation using the Temporal-backed MessageQueue.
 * `startQueue()` remains the public Fedify lifecycle call; the queue adapter
 * only binds its handler and never starts a Temporal Worker itself.
 */
export const createFedifyTemporalFederation = (
  queue: TemporalFedifyQueue,
  options: FedifyTemporalFederationOptions = {},
): Federation<void> =>
  createFederation<void>({
    kv: new MemoryKvStore(),
    manuallyStartQueue: true,
    queue,
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  });

/**
 * Register a local inbox listener that makes the runnable PoC observable.
 *
 * This listener intentionally has no application persistence side effects. It
 * proves that Fedify's queue consumer invokes a real typed listener after the
 * Temporal Activity boundary without loading production actor/key state.
 */
export const configureFedifyTemporalDemo = (federation: Federation<void>): void => {
  federation
    .setActorDispatcher('/ap/actor/{identifier}', async () => null)
    .setKeyPairsDispatcher(async () => []);
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Follow, async (context, activity) => {
      console.info(
        JSON.stringify({
          activityId: activity.id?.href ?? null,
          event: 'fedify-temporal-demo-follow',
          recipient: context.recipient,
        }),
      );
    });
};

/** Create one valid inbox payload for the demo producer. */
export const createFedifyTemporalDemoInboxMessage = () => ({
  type: 'inbox' as const,
  id: crypto.randomUUID(),
  baseUrl: 'https://local.example',
  activity: {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Follow',
    id: `https://remote.example/activities/${crypto.randomUUID()}`,
    actor: 'https://remote.example/actor',
    object: 'https://local.example/ap/actor/local',
  },
  started: new Date().toISOString(),
  attempt: 1,
  identifier: 'local',
  traceContext: {},
});
