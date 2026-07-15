import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-person';
import { resolveLocalActorIdentifierByHandle } from './webfinger';
import type { Federation } from '@fedify/fedify';

const federationOrigin = process.env.PUBLIC_ORIGIN;

export const federation: Federation<void> = createFederation<void>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
  ...(federationOrigin ? { origin: federationOrigin } : {}),
});

federation
  .setActorDispatcher('/ap/actor/{identifier}', async (ctx, identifier) => {
    if (ctx.host !== new URL(ctx.canonicalOrigin).host) {
      return null;
    }

    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalProfileActor({
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
  .mapHandle((context, username) =>
    context.host === new URL(context.canonicalOrigin).host
      ? resolveLocalActorIdentifierByHandle(username)
      : null,
  )
  .setKeyPairsDispatcher(async (ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const result = await ensureDrizzleLocalProfileActor({
      actorUri: ctx.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });

federation.setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox');
