import { createFederation, MemoryKvStore } from '@fedify/fedify';
import {
  Accept,
  Announce,
  Application,
  Block,
  Create,
  Delete,
  EmojiReact,
  Follow,
  Like,
  Move,
  Note,
  Object as ActivityObject,
  QuoteAuthorization,
  QuoteRequest,
  Reject,
  Undo,
  Update,
} from '@fedify/vocab';
import { db, first, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';
import { handleInboundAccept } from './inbound-accept';
import { handleInboundAnnounce } from './inbound-announce';
import { handleInboundCreate } from './inbound-create';
import { handleInboundDelete } from './inbound-delete';
import { handleInboundFollow, handleInboundUndo } from './inbound-follow';
import { handleInboundMove } from './inbound-move';
import {
  hasInboundErrorBeenObserved,
  isExternalInboundError,
  observeInbound,
  withInboundObservability,
} from './inbound-observability';
import { handleInboundBlock } from './inbound-profile-block';
import { handleInboundQuoteRequest } from './inbound-quote-command';
import { handleInboundReaction } from './inbound-reaction';
import { handleInboundReject } from './inbound-reject';
import { handleInboundUpdate } from './inbound-update';
import {
  ensureDrizzleLocalProfileActor,
  loadDrizzleLocalProfileActorKeyPairs,
} from './local-actor-store';
import { ensureDrizzleLocalInstanceActorKeyPairs } from './local-instance-actor-store';
import { authorizeLocalPostNote, dispatchLocalPostNote } from './local-post-note';
import {
  countLocalPostEmojiReactions,
  dispatchLocalPostEmojiReactions,
  firstLocalPostEmojiReactionsCursor,
} from './local-post-reaction-collection';
import { isCanonicalLocalProfileId } from './local-profile-actor';
import {
  authorizeLocalProfileFeatured,
  countLocalProfileFeatured,
  dispatchLocalProfileFeatured,
  firstLocalProfileFeaturedCursor,
} from './local-profile-featured';
import { dispatchLocalProfileFollow } from './local-profile-follow';
import { createLocalProfilePerson } from './local-profile-person';
import {
  authorizeLocalQuoteAuthorization,
  dispatchLocalQuoteAuthorization,
} from './local-quote-authorization';
import { fedifyMeterProvider } from './metrics';
import { fedifyKv, fedifyQueue } from './queue';
import { resolveLocalActorIdentifierByHandle } from './webfinger';
import type { Context, Federation, FederationOptions, InboxContext } from '@fedify/fedify';
import type { DocumentLoader } from '@fedify/fedify/runtime';

const federationOrigin = process.env.PUBLIC_ORIGIN;
export const localInstanceActorIdentifier = '~instance';
const localInstanceActorHandle = 'kosmo.instance';
const hasCanonicalHost = (context: Pick<Context<void>, 'canonicalOrigin' | 'host'>) =>
  context.host === new URL(context.canonicalOrigin).host;

type FederationLoaderOverrides = Pick<
  FederationOptions<void>,
  'authenticatedDocumentLoaderFactory' | 'contextLoaderFactory' | 'documentLoaderFactory'
> & { quoteAuthorizationDocumentLoader?: DocumentLoader };

/** Creates the configured application federation; production uses the singleton below. */
export const createKosmoFederation = (
  overrides: FederationLoaderOverrides = {},
): Federation<void> => {
  const { quoteAuthorizationDocumentLoader, ...loaderOverrides } = overrides;
  const quoteContext = (context: InboxContext<void>) =>
    Object.assign(context, { quoteAuthorizationDocumentLoader });
  const federation: Federation<void> = createFederation<void>({
    allowPrivateAddress: false,
    kv: fedifyKv ?? new MemoryKvStore(),
    meterProvider: fedifyMeterProvider,
    ...(fedifyQueue
      ? {
          // Producer and consumer processes share one durable queue.  Queue
          // listeners are started only by the dedicated Fedify consumer app.
          queue: fedifyQueue,
          manuallyStartQueue: true,
        }
      : {}),
    ...(federationOrigin ? { origin: federationOrigin } : {}),
    ...loaderOverrides,
  });

  federation
    .setActorDispatcher('/ap/actor/{identifier}', async (ctx, identifier) => {
      if (!hasCanonicalHost(ctx)) {
        return null;
      }

      if (identifier === localInstanceActorIdentifier) {
        const keyPairs = await ctx.getActorKeyPairs(localInstanceActorIdentifier);
        const rsaKeyPair = keyPairs.find(
          (keyPair) => keyPair.publicKey.algorithm.name === 'RSASSA-PKCS1-v1_5',
        );
        if (rsaKeyPair == null) {
          throw new Error(`Local Instance actor ${identifier} is missing an RSA key pair.`);
        }
        const actorUri = ctx.getActorUri(localInstanceActorIdentifier);
        return new Application({
          id: actorUri,
          inbox: new URL('/inbox', ctx.canonicalOrigin),
          preferredUsername: localInstanceActorHandle,
          publicKey: rsaKeyPair.cryptographicKey,
          assertionMethods: keyPairs
            .filter((keyPair) => keyPair.publicKey.algorithm.name === 'Ed25519')
            .map((keyPair) => keyPair.multikey),
        });
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
    .mapHandle((context, username) => {
      if (!hasCanonicalHost(context)) {
        return null;
      }

      return normalizeHandle(username) === localInstanceActorHandle
        ? localInstanceActorIdentifier
        : resolveLocalActorIdentifierByHandle(username);
    })
    .setKeyPairsDispatcher(async (ctx, identifier) => {
      if (identifier === localInstanceActorIdentifier) {
        if (!hasCanonicalHost(ctx)) {
          return [];
        }

        const localInstance = await resolveConfiguredLocalInstance();
        return ensureDrizzleLocalInstanceActorKeyPairs(localInstance.id);
      }

      const localInstance = await resolveConfiguredLocalInstance();
      const result = await ensureDrizzleLocalProfileActor({
        actorUri: ctx.getActorUri(identifier),
        localInstanceId: localInstance.id,
        profileId: identifier,
      });

      return result
        ? [...result.keyPairs]
        : loadDrizzleLocalProfileActorKeyPairs({
            localInstanceId: localInstance.id,
            profileId: identifier,
          });
    });

  const findActiveLocalProfile = async (
    context: Pick<Context<void>, 'canonicalOrigin' | 'host'>,
    profileId: string,
  ) => {
    // Multiple Local Instances are valid domain state. This runtime currently serves only its
    // configured origin; request-origin instance resolution is tracked by PROD-376.
    if (
      context.host !== new URL(context.canonicalOrigin).host ||
      !isCanonicalLocalProfileId(profileId)
    ) {
      return undefined;
    }

    const localInstance = await resolveConfiguredLocalInstance();

    return db
      .select({
        followersCount: Profiles.followersCount,
        followingCount: Profiles.followingCount,
      })
      .from(Profiles)
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.instanceId, localInstance.id),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
  };

  federation
    .setFollowersDispatcher(
      '/ap/actor/{identifier}/followers',
      async (context, identifier, cursor) =>
        cursor == null && (await findActiveLocalProfile(context, identifier))
          ? { items: [] }
          : null,
    )
    .setCounter(async (context, identifier) =>
      findActiveLocalProfile(context, identifier).then(
        (profile) => profile?.followersCount ?? null,
      ),
    );

  federation
    .setFollowingDispatcher(
      '/ap/actor/{identifier}/following',
      async (context, identifier, cursor) =>
        cursor == null && (await findActiveLocalProfile(context, identifier))
          ? { items: [] }
          : null,
    )
    .setCounter(async (context, identifier) =>
      findActiveLocalProfile(context, identifier).then(
        (profile) => profile?.followingCount ?? null,
      ),
    );

  federation
    .setFeaturedDispatcher('/ap/actor/{identifier}/featured', dispatchLocalProfileFeatured)
    .setCounter(countLocalProfileFeatured)
    .setFirstCursor(firstLocalProfileFeaturedCursor)
    .authorize(authorizeLocalProfileFeatured);

  federation
    .setObjectDispatcher(Note, '/ap/note/{id}', dispatchLocalPostNote)
    .authorize(authorizeLocalPostNote);

  federation
    .setCollectionDispatcher(
      'activitypub-note-emoji-reactions',
      ActivityObject,
      '/ap/note/{id}/emoji-reactions',
      dispatchLocalPostEmojiReactions,
    )
    .setCounter(countLocalPostEmojiReactions)
    .setFirstCursor(firstLocalPostEmojiReactionsCursor)
    .authorize((context, values) => authorizeLocalPostNote(context, { id: values.id ?? '' }));

  federation
    .setObjectDispatcher(
      QuoteAuthorization,
      '/ap/quote-authorization/{id}',
      dispatchLocalQuoteAuthorization,
    )
    .authorize(authorizeLocalQuoteAuthorization);

  federation.setObjectDispatcher(Follow, '/ap/follow/{id}', dispatchLocalProfileFollow);

  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .setSharedKeyDispatcher((context) =>
      hasCanonicalHost(context) ? { identifier: localInstanceActorIdentifier } : null,
    )
    .on(Accept, withInboundObservability('accept', handleInboundAccept))
    .on(Announce, withInboundObservability('announce', handleInboundAnnounce))
    .on(Block, withInboundObservability('block', handleInboundBlock))
    .on(
      Create,
      withInboundObservability('create', (context, activity) =>
        handleInboundCreate(quoteContext(context), activity),
      ),
    )
    .on(
      Delete,
      withInboundObservability('delete', (context, activity) =>
        handleInboundDelete(quoteContext(context), activity),
      ),
    )
    .on(EmojiReact, withInboundObservability('reaction', handleInboundReaction))
    .on(Follow, withInboundObservability('follow', handleInboundFollow))
    .on(Like, withInboundObservability('reaction', handleInboundReaction))
    .on(Move, withInboundObservability('move', handleInboundMove))
    .on(QuoteRequest, withInboundObservability('quote', handleInboundQuoteRequest))
    .on(Reject, withInboundObservability('reject', handleInboundReject))
    .on(Undo, withInboundObservability('undo', handleInboundUndo))
    .on(
      Update,
      withInboundObservability('update', (context, activity) =>
        handleInboundUpdate(quoteContext(context), activity),
      ),
    )
    .onError((_context, error) => {
      if (hasInboundErrorBeenObserved(error)) {
        return;
      }

      // Fedify invokes this boundary for failures that happen before a typed
      // listener receives an Activity (for example, malformed request JSON).
      // Typed listener errors are marked observed by withInboundObservability,
      // so SyntaxError is external only at this unobserved pre-dispatch edge.
      const external = error instanceof SyntaxError || isExternalInboundError(error);
      observeInbound({
        activityType: 'Unknown',
        error,
        handler: 'listener',
        outcome: external ? 'external_failure' : 'internal_failure',
        phase: 'listener',
        reasonCode: external ? 'external_listener_error' : 'unexpected_listener_error',
      });
    });

  return federation;
};

export const federation: Federation<void> = createKosmoFederation();
