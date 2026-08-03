import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';

export type LocalOutboundContextData = {
  readonly localInstanceId: string;
};

export const localOutboundFederation = createFederation<LocalOutboundContextData>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
});

localOutboundFederation
  .setActorDispatcher('/ap/actor/{identifier}', () => null)
  .setKeyPairsDispatcher(async (context, identifier) => {
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: context.getActorUri(identifier),
      localInstanceId: context.data.localInstanceId,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });

localOutboundFederation.setFollowersDispatcher('/ap/actor/{identifier}/followers', () => null);
localOutboundFederation.setFollowingDispatcher('/ap/actor/{identifier}/following', () => null);
