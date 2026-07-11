import { createFederation, getDocumentLoader, kvCache, MemoryKvStore } from '@fedify/fedify';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import { createLocalProfilePerson } from './local-profile-person';
import { resolveLocalActorIdentifierByHandle } from './webfinger';
import type { DocumentLoaderFactoryOptions, Federation } from '@fedify/fedify';

const federationOrigin = process.env.PUBLIC_ORIGIN;
export const remoteActorLookupMaxResponseSize = 1024 * 1024;
const federationKv = new MemoryKvStore();

export const createBoundedDocumentLoader =
  (kind: 'object' | 'context') => (options?: DocumentLoaderFactoryOptions) =>
    kvCache({
      loader: getDocumentLoader({
        allowPrivateAddress: options?.allowPrivateAddress ?? false,
        maxResponseSize: remoteActorLookupMaxResponseSize,
        userAgent: options?.userAgent,
      }),
      kv: federationKv,
      prefix: ['_fedify', 'remoteDocument'],
      kind,
    });

export const federation: Federation<void> = createFederation<void>({
  allowPrivateAddress: false,
  contextLoaderFactory: createBoundedDocumentLoader('context'),
  documentLoaderFactory: createBoundedDocumentLoader('object'),
  kv: federationKv,
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
