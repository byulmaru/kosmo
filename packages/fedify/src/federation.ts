import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { buildActorScopedUri } from './actor-uri';
import { ensureLocalActorKeyPairs } from './local-actor-keys';
import { ensureDrizzleLocalActorKeyPairs } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-actor';
import type { Federation } from '@fedify/fedify';
import type { EnsureLocalActorKeyPairsOptions, LocalActorStore } from './local-actor-keys';

interface ConfiguredLocalInstance {
  readonly id: string;
  readonly canonicalOrigin: string | null;
}

export interface CreateKosmoFederationOptions {
  readonly origin?: string;
  readonly resolveLocalInstance?: () => Promise<ConfiguredLocalInstance>;
  readonly store?: LocalActorStore;
}

type EnsureActorKeyPairsOptions = Omit<EnsureLocalActorKeyPairsOptions, 'store'>;

const buildLocalActorUri = (canonicalOrigin: string, identifier: string): URL =>
  new URL(`/ap/actor/${encodeURIComponent(identifier)}`, canonicalOrigin);

const buildLocalProfileUri = (canonicalOrigin: string, handle: string): URL =>
  new URL(`/@${encodeURIComponent(handle)}`, canonicalOrigin);

const getCanonicalOrigin = (localInstance: ConfiguredLocalInstance): string => {
  if (!localInstance.canonicalOrigin) {
    throw new Error(`Configured local instance ${localInstance.id} is missing canonicalOrigin.`);
  }

  return localInstance.canonicalOrigin;
};

const createEnsureActorKeyPairs = (store: LocalActorStore | undefined) => {
  if (!store) {
    return ensureDrizzleLocalActorKeyPairs;
  }

  return (options: EnsureActorKeyPairsOptions) => ensureLocalActorKeyPairs({ ...options, store });
};

export const createKosmoFederation = ({
  origin = process.env.PUBLIC_ORIGIN,
  resolveLocalInstance = resolveConfiguredLocalInstance,
  store,
}: CreateKosmoFederationOptions = {}): Federation<void> => {
  const federation = createFederation<void>({
    kv: new MemoryKvStore(),
    ...(origin ? { origin } : {}),
  });
  const ensureActorKeyPairs = createEnsureActorKeyPairs(store);

  federation
    .setActorDispatcher('/ap/actor/{identifier}', async (_ctx, identifier) => {
      const localInstance = await resolveLocalInstance();
      const canonicalOrigin = getCanonicalOrigin(localInstance);
      const actorUri = buildLocalActorUri(canonicalOrigin, identifier);
      const result = await ensureActorKeyPairs({
        actorUri,
        localInstanceId: localInstance.id,
        profileId: identifier,
      });

      if (!result) {
        return null;
      }

      // Build key IDs from the canonical origin, not from an arbitrary request origin.
      const canonicalContext = federation.createContext(new URL(canonicalOrigin), undefined);
      const keyPairs = await canonicalContext.getActorKeyPairs(identifier);

      // These URIs are advertised now; their handlers stay intentionally unsupported for this change.
      return createLocalProfilePerson({
        actorUri,
        inboxUri: buildActorScopedUri(actorUri, 'inbox'),
        keyPairs,
        outboxUri: buildActorScopedUri(actorUri, 'outbox'),
        profile: result.profile,
        profileUri: buildLocalProfileUri(canonicalOrigin, result.profile.handle),
      });
    })
    .setKeyPairsDispatcher(async (_ctx, identifier) => {
      const localInstance = await resolveLocalInstance();
      const canonicalOrigin = getCanonicalOrigin(localInstance);
      const result = await ensureActorKeyPairs({
        actorUri: buildLocalActorUri(canonicalOrigin, identifier),
        localInstanceId: localInstance.id,
        profileId: identifier,
      });

      return result ? [...result.keyPairs] : [];
    });

  return federation;
};

export const federation: Federation<void> = createKosmoFederation();
