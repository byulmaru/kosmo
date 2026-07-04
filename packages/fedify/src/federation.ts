import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { ensureDrizzleLocalActorKeyPairs } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-actor';
import type { Federation } from '@fedify/fedify';

interface ConfiguredLocalInstance {
  readonly id: string;
  readonly canonicalOrigin: string | null;
}

const federationOrigin = process.env.PUBLIC_ORIGIN;

const getCanonicalOrigin = (localInstance: ConfiguredLocalInstance): string => {
  if (!localInstance.canonicalOrigin) {
    throw new Error(`Configured local instance ${localInstance.id} is missing canonicalOrigin.`);
  }

  return localInstance.canonicalOrigin;
};

export const federation: Federation<void> = createFederation<void>({
  kv: new MemoryKvStore(),
  ...(federationOrigin ? { origin: federationOrigin } : {}),
});

federation
  .setActorDispatcher('/ap/actor/{identifier}', async (_ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const canonicalOrigin = getCanonicalOrigin(localInstance);
    const canonicalContext = federation.createContext(new URL(canonicalOrigin), undefined);
    const result = await ensureDrizzleLocalActorKeyPairs({
      actorUri: canonicalContext.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    if (!result) {
      return null;
    }

    const actorIdentifier = result.profile.id;
    // Keep inbox/outbox routes unregistered until delivery and collections are implemented.
    const actorUri = canonicalContext.getActorUri(actorIdentifier);
    const actorPathname = actorUri.pathname.replace(/\/$/, '');
    const keyPairs = await canonicalContext.getActorKeyPairs(actorIdentifier);

    return createLocalProfilePerson({
      actorUri,
      inboxUri: new URL(`${actorPathname}/inbox`, actorUri),
      keyPairs,
      outboxUri: new URL(`${actorPathname}/outbox`, actorUri),
      profile: result.profile,
      profileUri: new URL(`/@${encodeURIComponent(result.profile.handle)}`, canonicalOrigin),
    });
  })
  .mapHandle(() => null)
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    const localInstance = await resolveConfiguredLocalInstance();
    const canonicalOrigin = getCanonicalOrigin(localInstance);
    const canonicalContext = federation.createContext(new URL(canonicalOrigin), undefined);
    const result = await ensureDrizzleLocalActorKeyPairs({
      actorUri: canonicalContext.getActorUri(identifier),
      localInstanceId: localInstance.id,
      profileId: identifier,
    });

    return result ? [...result.keyPairs] : [];
  });
