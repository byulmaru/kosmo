import {
  Accept,
  Create,
  Delete,
  Note,
  PUBLIC_COLLECTION,
  QuoteAuthorization,
  QuoteRequest,
  Reject,
  Update,
} from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  PostMentions,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { loadQuoteConsentForPost } from '@kosmo/core/services';
import { and, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isHttpUri } from './activitypub-uri';
import { localOutboundFederation } from './local-outbound-federation';
import { projectLocalPostNote, projectLocalPostQuoteRequestInstrument } from './local-post-note';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';
import type { Recipient } from '@fedify/vocab';

const ReplyParents = alias(Posts, 'local_post_delivery_reply_parent');
const ReplyParentProfiles = alias(Profiles, 'local_post_delivery_reply_parent_profile');
const ReplyParentInstances = alias(Instances, 'local_post_delivery_reply_parent_instance');
const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

const getFollowersUri = (actorUri: URL): URL =>
  new URL(`${actorUri.pathname.replace(/\/$/, '')}/followers`, actorUri);

const parseHttpUri = (value: string | null): URL | null => {
  try {
    const uri = new URL(value ?? '');
    return isHttpUri(uri) ? uri : null;
  } catch {
    return null;
  }
};

const getDirectMentionRecipients = async (postId: string) => {
  const mentions = await db
    .select({
      contentId: Posts.currentContentId,
      inboxUri: ActivityPubActors.inboxUri,
      profileId: Profiles.id,
      uri: ActivityPubActors.uri,
    })
    .from(Posts)
    .innerJoin(PostMentions, eq(PostMentions.postContentId, Posts.currentContentId))
    .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.visibility, PostVisibility.DIRECT),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    );
  const profileIds = new Set<string>();
  const actorUris = new Map<string, URL>();
  for (const mention of mentions) {
    const actorUri = parseHttpUri(mention.uri);
    if (!actorUri || !parseHttpUri(mention.inboxUri)) {
      continue;
    }
    profileIds.add(mention.profileId);
    actorUris.set(actorUri.href, actorUri);
  }
  return {
    actorUris: [...actorUris.values()],
    contentId: mentions[0]?.contentId ?? null,
    profileIds: [...profileIds],
  };
};

export const sendLocalPostCreate = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .leftJoin(ReplyParentProfiles, eq(ReplyParentProfiles.id, ReplyParents.profileId))
    .leftJoin(ReplyParentInstances, eq(ReplyParentInstances.id, ReplyParentProfiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row ?? null);
  if (!source?.canonicalOrigin) {
    return;
  }

  const directMentionRecipients =
    source.visibility === PostVisibility.DIRECT ? await getDirectMentionRecipients(postId) : null;
  if (directMentionRecipients && directMentionRecipients.profileIds.length === 0) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(
    context,
    postId,
    directMentionRecipients
      ? { directRecipientUris: directMentionRecipients.actorUris }
      : undefined,
  );
  if (!projection) {
    return;
  }
  if (
    directMentionRecipients &&
    (projection.contentId !== directMentionRecipients.contentId ||
      projection.visibility !== PostVisibility.DIRECT)
  ) {
    return;
  }

  const objectUri = noteUri(projection.canonicalOrigin, postId);
  const activity = new Create({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL('#create', objectUri),
    object: projection.object,
    published: projection.createdAt,
    tos: projection.object.toIds,
  });
  const directProfileId =
    projection.replyParentId &&
    (projection.visibility === PostVisibility.PUBLIC ||
      projection.visibility === PostVisibility.UNLISTED) &&
    source.parentInstanceKind === InstanceKind.ACTIVITYPUB
      ? source.parentProfileId
      : null;
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: projection.authorProfileId,
    context,
    directProfileIds: directMentionRecipients
      ? directMentionRecipients.profileIds
      : directProfileId
        ? [directProfileId]
        : [],
    ...(directMentionRecipients ? { directOnly: true } : {}),
  });
};

export type QuoteConsentEffect = {
  readonly postId: string;
  readonly sourcePostId: string;
  readonly effectId: string;
  readonly requestUri?: string;
  readonly status?: PostQuoteConsentStatus;
};

const loadParticipant = async (postId: string) =>
  db
    .select({
      profileId: Profiles.id,
      profileState: Profiles.state,
      instanceState: Instances.state,
      kind: Instances.kind,
      canonicalOrigin: Instances.canonicalOrigin,
      instanceId: Instances.id,
      actorUri: ActivityPubActors.uri,
      inboxUri: ActivityPubActors.inboxUri,
      sharedInboxUri: ActivityPubActors.sharedInboxUri,
      postState: Posts.state,
      currentContentId: Posts.currentContentId,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

export const sendLocalPostConsentUpdate = async (effect: QuoteConsentEffect): Promise<void> => {
  const consent = await loadQuoteConsentForPost(db, effect.postId, effect.sourcePostId);
  if (!consent || (effect.status && consent.status !== effect.status)) {
    return;
  }
  const quote = await loadParticipant(effect.postId);
  if (
    !quote?.canonicalOrigin ||
    quote.kind !== InstanceKind.LOCAL ||
    quote.postState !== PostState.ACTIVE
  ) {
    return;
  }
  const forQuoteRevocation = consent.status === PostQuoteConsentStatus.REVOKED;
  if (
    !forQuoteRevocation &&
    (quote.profileState !== ProfileState.ACTIVE || quote.instanceState !== InstanceState.ACTIVE)
  ) {
    return;
  }
  const context = localOutboundFederation.createContext(new URL(quote.canonicalOrigin), {
    localInstanceId: quote.instanceId,
  });
  const projection = await projectLocalPostNote(context, effect.postId, { forQuoteRevocation });
  if (!projection) {
    if (forQuoteRevocation) {
      throw new Error(`Cannot project Quote revocation for ${effect.postId}`);
    }
    return;
  }
  const activity = new Update({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL(
      `#quote-consent-${encodeURIComponent(effect.effectId)}`,
      noteUri(projection.canonicalOrigin, effect.postId),
    ),
    object: projection.object,
    published: projection.createdAt,
    tos: projection.object.toIds,
  });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: projection.authorProfileId,
    context,
    directProfileIds: [],
  });
};

export const sendLocalPostQuoteRequest = async (effect: QuoteConsentEffect): Promise<void> => {
  const consent = await loadQuoteConsentForPost(db, effect.postId, effect.sourcePostId);
  if (!consent || consent.status !== PostQuoteConsentStatus.PENDING || !consent.requestUri) {
    return;
  }
  const [quote, source] = await Promise.all([
    loadParticipant(effect.postId),
    loadParticipant(effect.sourcePostId),
  ]);
  if (
    !quote?.canonicalOrigin ||
    quote.kind !== InstanceKind.LOCAL ||
    source?.kind !== InstanceKind.ACTIVITYPUB ||
    source.postState !== PostState.ACTIVE ||
    source.currentContentId === null ||
    source.profileState !== ProfileState.ACTIVE ||
    source.instanceState !== InstanceState.ACTIVE ||
    quote.profileState !== ProfileState.ACTIVE ||
    quote.instanceState !== InstanceState.ACTIVE
  ) {
    return;
  }
  if (!source.actorUri || !source.inboxUri) {
    throw new Error('Pending QuoteRequest delivery identity is incomplete');
  }
  const context = localOutboundFederation.createContext(new URL(quote.canonicalOrigin), {
    localInstanceId: quote.instanceId,
  });
  const instrument = await projectLocalPostQuoteRequestInstrument(
    context,
    effect.postId,
    consent.sourceUri,
    source.actorUri,
  );
  if (!instrument || instrument.id?.href !== consent.quoteUri) {
    return;
  }
  const activity = new QuoteRequest({
    actor: context.getActorUri(quote.profileId),
    id: new URL(consent.requestUri),
    instrument,
    object: new URL(consent.sourceUri),
    tos: [new URL(source.actorUri)],
  });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: quote.profileId,
    context,
    directProfileIds: [source.profileId],
    includeFollowers: false,
  });
};

export const sendLocalPostQuoteDecision = async (effect: QuoteConsentEffect): Promise<void> => {
  const consent = await loadQuoteConsentForPost(db, effect.postId, effect.sourcePostId);
  if (
    !consent ||
    !effect.requestUri ||
    (consent.status !== PostQuoteConsentStatus.APPROVED &&
      consent.status !== PostQuoteConsentStatus.REJECTED) ||
    (effect.status && effect.status !== consent.status)
  ) {
    return;
  }
  const [quote, source] = await Promise.all([
    loadParticipant(effect.postId),
    loadParticipant(effect.sourcePostId),
  ]);
  if (
    !source?.canonicalOrigin ||
    source.kind !== InstanceKind.LOCAL ||
    source.postState !== PostState.ACTIVE ||
    source.currentContentId === null ||
    source.profileState !== ProfileState.ACTIVE ||
    source.instanceState !== InstanceState.ACTIVE ||
    quote?.kind !== InstanceKind.ACTIVITYPUB ||
    quote.profileState !== ProfileState.ACTIVE ||
    quote.instanceState !== InstanceState.ACTIVE
  ) {
    return;
  }
  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.instanceId,
  });
  const actor = new URL(consent.sourceAuthorActorUri),
    quoteActor = new URL(consent.quoteAuthorActorUri),
    requestUri = new URL(effect.requestUri);
  const request = new QuoteRequest({
    actor: quoteActor,
    id: requestUri,
    instrument: new Note({
      attribution: quoteActor,
      id: new URL(consent.quoteUri),
      quote: new URL(consent.sourceUri),
      quoteUrl: new URL(consent.sourceUri),
    }),
    object: new URL(consent.sourceUri),
    tos: [actor],
  });
  const activity =
    consent.status === PostQuoteConsentStatus.APPROVED
      ? new Accept({
          actor,
          id: new URL(`#accept-${encodeURIComponent(effect.effectId)}`, requestUri),
          object: request,
          result: new QuoteAuthorization({
            attribution: actor,
            id: new URL(`/ap/quote-authorization/${effect.postId}`, source.canonicalOrigin),
            interactingObject: new URL(consent.quoteUri),
            interactionTarget: new URL(consent.sourceUri),
          }),
          tos: [quoteActor],
        })
      : new Reject({
          actor,
          id: new URL(`#reject-${encodeURIComponent(effect.effectId)}`, requestUri),
          object: request,
          tos: [quoteActor],
        });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: source.profileId,
    context,
    directProfileIds: [quote.profileId],
    includeFollowers: false,
  });
};

export const sendLocalPostQuoteRevocation = async (effect: QuoteConsentEffect): Promise<void> => {
  const consent = await loadQuoteConsentForPost(db, effect.postId, effect.sourcePostId);
  if (!consent || consent.status !== PostQuoteConsentStatus.REVOKED) {
    return;
  }
  const [quote, source] = await Promise.all([
    loadParticipant(effect.postId),
    loadParticipant(effect.sourcePostId),
  ]);
  if (!quote || !source) {
    return;
  }
  if (quote.kind === InstanceKind.LOCAL) {
    await sendLocalPostConsentUpdate({ ...effect, status: PostQuoteConsentStatus.REVOKED });
    return;
  }
  if (
    source.kind !== InstanceKind.LOCAL ||
    !source.canonicalOrigin ||
    !quote.actorUri ||
    !quote.inboxUri
  ) {
    return;
  }
  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.instanceId,
  });
  const authorizationUri = new URL(
    `/ap/quote-authorization/${effect.postId}`,
    source.canonicalOrigin,
  );
  const activity = new Delete({
    actor: context.getActorUri(source.profileId),
    id: new URL(`#revoke-${encodeURIComponent(effect.effectId)}`, authorizationUri),
    object: authorizationUri,
    target: new URL(consent.sourceUri),
    tos: [new URL(quote.actorUri)],
  });
  const recipient: Recipient = {
    endpoints: quote.sharedInboxUri ? { sharedInbox: new URL(quote.sharedInboxUri) } : null,
    id: new URL(quote.actorUri),
    inboxId: new URL(quote.inboxUri),
  };
  await context.sendActivity({ identifier: source.profileId }, [recipient], activity, {
    preferSharedInbox: true,
  });
};

export const sendLocalPostQuoteRevocations = async (sourcePostId: string): Promise<void> => {
  const source = await loadParticipant(sourcePostId);
  if (source?.postState !== PostState.DELETED) {
    return;
  }
  const quotes = await db
    .select({ postId: Posts.id })
    .from(Posts)
    .where(
      and(
        eq(Posts.repostSourceId, sourcePostId),
        eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.REVOKED),
      ),
    );
  let firstFailure: unknown;
  for (const quote of quotes) {
    try {
      await sendLocalPostQuoteRevocation({
        postId: quote.postId,
        sourcePostId,
        effectId: `source-delete:${sourcePostId}:quote-revoke:${quote.postId}`,
      });
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure) {
    throw firstFailure;
  }
};

export const sendLocalPostDelete = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      authorProfileId: Profiles.id,
      canonicalOrigin: Instances.canonicalOrigin,
      deletedAt: Posts.deletedAt,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
      replyParentId: Posts.replyParentId,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .leftJoin(ReplyParentProfiles, eq(ReplyParentProfiles.id, ReplyParents.profileId))
    .leftJoin(ReplyParentInstances, eq(ReplyParentInstances.id, ReplyParentProfiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.DELETED),
        isNotNull(Posts.currentContentId),
        isNotNull(Posts.deletedAt),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin || !source.deletedAt) {
    return;
  }

  const directMentionRecipients =
    source.visibility === PostVisibility.DIRECT ? await getDirectMentionRecipients(postId) : null;
  if (directMentionRecipients && directMentionRecipients.profileIds.length === 0) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(source.authorProfileId);
  const followersUri = getFollowersUri(actorUri);
  const objectUri = noteUri(source.canonicalOrigin, postId);
  const activity = new Delete({
    actor: actorUri,
    ccs: directMentionRecipients
      ? []
      : source.visibility === PostVisibility.PUBLIC
        ? [followersUri]
        : source.visibility === PostVisibility.UNLISTED
          ? [PUBLIC_COLLECTION]
          : [],
    id: new URL('#delete', objectUri),
    object: objectUri,
    published: source.deletedAt,
    tos: directMentionRecipients
      ? directMentionRecipients.actorUris
      : source.visibility === PostVisibility.PUBLIC
        ? [PUBLIC_COLLECTION]
        : [followersUri],
  });
  const directProfileId =
    source.replyParentId &&
    (source.visibility === PostVisibility.PUBLIC ||
      source.visibility === PostVisibility.UNLISTED) &&
    source.parentInstanceKind === InstanceKind.ACTIVITYPUB
      ? source.parentProfileId
      : null;
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: source.authorProfileId,
    context,
    directProfileIds: directMentionRecipients
      ? directMentionRecipients.profileIds
      : directProfileId
        ? [directProfileId]
        : [],
    ...(directMentionRecipients ? { directOnly: true } : {}),
  });
};
