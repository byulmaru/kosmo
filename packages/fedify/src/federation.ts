import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { ensureDrizzleLocalActorKeyPairs } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-actor';
import type { Federation } from '@fedify/fedify';

const federationOrigin = process.env.PUBLIC_ORIGIN;

export const federation: Federation<void> = createFederation<void>({
  kv: new MemoryKvStore(),
  ...(federationOrigin ? { origin: federationOrigin } : {}),
});

federation
  .setActorDispatcher('/ap/actor/{identifier}', async (ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalActorKeyPairs({
      actorUri: ctx.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    if (!result) {
      return null;
    }

    const actorIdentifier = result.profile.id;
    const keyPairs = await ctx.getActorKeyPairs(actorIdentifier);

    return createLocalProfilePerson({
      context: ctx,
      keyPairs,
      profile: result.profile,
    });
  })
  .mapHandle(() => null)
  .setKeyPairsDispatcher(async (ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalActorKeyPairs({
      actorUri: ctx.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });
