import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';

type LocalReplyContextData = {
  readonly localInstanceId: string;
};

export const localReplyFederation = createFederation<LocalReplyContextData>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
});

localReplyFederation
  .setActorDispatcher('/ap/actor/{identifier}', () => null)
  .setKeyPairsDispatcher(async (context, identifier) => {
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: context.getActorUri(identifier),
      localInstanceId: context.data.localInstanceId,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });
