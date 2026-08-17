import { createFederation, MemoryKvStore } from '@fedify/fedify';
import {
  ensureDrizzleLocalProfileActor,
  loadDrizzleLocalProfileActorKeyPairs,
} from './local-actor-store';
import { fedifyQueue } from './queue';

export type LocalOutboundContextData = {
  readonly localInstanceId: string;
};

export const localOutboundFederation = createFederation<LocalOutboundContextData>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
  ...(fedifyQueue
    ? {
        // Use the same inbox/outbox/fan-out transport as the main federation.
        // Existing delivery helpers remain the sole owners of ordering keys.
        queue: fedifyQueue,
        manuallyStartQueue: true,
      }
    : {}),
});

localOutboundFederation
  .setActorDispatcher('/ap/actor/{identifier}', () => null)
  .setKeyPairsDispatcher(async (context, identifier) => {
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: context.getActorUri(identifier),
      localInstanceId: context.data.localInstanceId,
      profileId: identifier,
    });

    return result
      ? [...result.keyPairs]
      : loadDrizzleLocalProfileActorKeyPairs({
          localInstanceId: context.data.localInstanceId,
          profileId: identifier,
        });
  });

localOutboundFederation.setFollowersDispatcher('/ap/actor/{identifier}/followers', () => null);
localOutboundFederation.setFollowingDispatcher('/ap/actor/{identifier}/following', () => null);
