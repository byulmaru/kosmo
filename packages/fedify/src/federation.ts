import { createFederation, MemoryKvStore } from '@fedify/fedify';
import {
  Accept,
  Announce,
  Create,
  Delete,
  EmojiReact,
  Follow,
  Like,
  Note,
  Object as ActivityObject,
  Reject,
  Undo,
  Update,
} from '@fedify/vocab';
import { db, first, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq } from 'drizzle-orm';
import { handleInboundAccept } from './inbound-accept';
import { handleInboundAnnounce } from './inbound-announce';
import { handleInboundCreate } from './inbound-create';
import { handleInboundDelete } from './inbound-delete';
import { handleInboundFollow, handleInboundUndo } from './inbound-follow';
import {
  hasInboundErrorBeenObserved,
  isExternalInboundError,
  observeInbound,
  withInboundObservability,
} from './inbound-observability';
import { handleInboundReaction } from './inbound-reaction';
import { handleInboundReject } from './inbound-reject';
import { handleInboundUpdate } from './inbound-update';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import { authorizeLocalPostNote, dispatchLocalPostNote } from './local-post-note';
import {
  countLocalPostEmojiReactions,
  dispatchLocalPostEmojiReactions,
  firstLocalPostEmojiReactionsCursor,
} from './local-post-reaction-collection';
import { isCanonicalLocalProfileId } from './local-profile-actor';
import { dispatchLocalProfileFollow } from './local-profile-follow';
import { createLocalProfilePerson } from './local-profile-person';
import { fedifyQueue } from './queue';
import { resolveLocalActorIdentifierByHandle } from './webfinger';
import type { Context, Federation } from '@fedify/fedify';

const federationOrigin = process.env.PUBLIC_ORIGIN;

export const federation: Federation<void> = createFederation<void>({
  allowPrivateAddress: false,
  kv: new MemoryKvStore(),
  ...(fedifyQueue
    ? {
        // Producer and consumer processes share one durable queue.  Queue
        // listeners are started only by src/consumer.ts.
        queue: fedifyQueue,
        manuallyStartQueue: true,
      }
    : {}),
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
      cursor == null && (await findActiveLocalProfile(context, identifier)) ? { items: [] } : null,
  )
  .setCounter(async (context, identifier) =>
    findActiveLocalProfile(context, identifier).then((profile) => profile?.followersCount ?? null),
  );

federation
  .setFollowingDispatcher(
    '/ap/actor/{identifier}/following',
    async (context, identifier, cursor) =>
      cursor == null && (await findActiveLocalProfile(context, identifier)) ? { items: [] } : null,
  )
  .setCounter(async (context, identifier) =>
    findActiveLocalProfile(context, identifier).then((profile) => profile?.followingCount ?? null),
  );

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

federation.setObjectDispatcher(Follow, '/ap/follow/{id}', dispatchLocalProfileFollow);

federation
  .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
  .on(Accept, withInboundObservability('accept', handleInboundAccept))
  .on(Announce, withInboundObservability('announce', handleInboundAnnounce))
  .on(Create, withInboundObservability('create', handleInboundCreate))
  .on(Delete, withInboundObservability('delete', handleInboundDelete))
  .on(EmojiReact, withInboundObservability('reaction', handleInboundReaction))
  .on(Follow, withInboundObservability('follow', handleInboundFollow))
  .on(Like, withInboundObservability('reaction', handleInboundReaction))
  .on(Reject, withInboundObservability('reject', handleInboundReject))
  .on(Undo, withInboundObservability('undo', handleInboundUndo))
  .on(Update, withInboundObservability('update', handleInboundUpdate))
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
