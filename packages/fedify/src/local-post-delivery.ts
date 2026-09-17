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
  PostQuoteConsents,
  PostQuotePolicies,
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
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { localOutboundFederation } from './local-outbound-federation';
import { projectLocalPostNote, projectLocalPostQuoteRequestInstrument } from './local-post-note';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';

const ReplyParents = alias(Posts, 'local_post_delivery_reply_parent');
const ReplyParentProfiles = alias(Profiles, 'local_post_delivery_reply_parent_profile');
const ReplyParentInstances = alias(Instances, 'local_post_delivery_reply_parent_instance');
const QuoteAuthorProfiles = alias(Profiles, 'local_post_delivery_quote_author_profile');
const QuoteAuthorInstances = alias(Instances, 'local_post_delivery_quote_author_instance');
const QuoteAuthorActors = alias(ActivityPubActors, 'local_post_delivery_quote_author_actor');
const SourceActors = alias(ActivityPubActors, 'local_post_delivery_source_actor');

const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

const getFollowersUri = (actorUri: URL): URL =>
  new URL(`${actorUri.pathname.replace(/\/$/, '')}/followers`, actorUri);

export const sendLocalPostCreate = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
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
        ne(Posts.visibility, PostVisibility.DIRECT),
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

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(context, postId);
  if (!projection) {
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
    directProfileIds: directProfileId ? [directProfileId] : [],
  });
};

export const sendLocalPostUpdate = async ({
  postId,
  revision,
}: {
  readonly postId: string;
  readonly revision: number;
}): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      quotePolicyRevision: PostQuotePolicies.revision,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(PostQuotePolicies, eq(PostQuotePolicies.postId, Posts.id))
    .where(
      and(
        eq(Posts.id, postId),
        eq(PostQuotePolicies.revision, revision),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        ne(Posts.visibility, PostVisibility.DIRECT),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin || source.quotePolicyRevision !== revision) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(context, postId);
  if (!projection || projection.quotePolicyRevision !== revision) {
    return;
  }

  const objectUri = noteUri(projection.canonicalOrigin, postId);
  const activity = new Update({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL(`#quote-policy-${revision}`, objectUri),
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

export const sendLocalPostConsentUpdate = async ({
  consentId,
  postId,
  revision,
}: {
  readonly consentId: string;
  readonly postId: string;
  readonly revision: number;
}): Promise<void> => {
  const quote = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      consentRevision: PostQuoteConsents.revision,
    })
    .from(PostQuoteConsents)
    .innerJoin(Posts, eq(Posts.id, PostQuoteConsents.quotePostId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(PostQuoteConsents.id, consentId),
        eq(PostQuoteConsents.quotePostId, postId),
        eq(PostQuoteConsents.revision, revision),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        ne(Posts.visibility, PostVisibility.DIRECT),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!quote?.canonicalOrigin || quote.consentRevision !== revision) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(quote.canonicalOrigin), {
    localInstanceId: quote.localInstanceId,
  });
  const projection = await projectLocalPostNote(context, postId);
  if (!projection) {
    return;
  }

  const objectUri = noteUri(projection.canonicalOrigin, postId);
  const activity = new Update({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL(`#quote-consent-${consentId}-${revision}`, objectUri),
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

export const sendLocalPostQuoteRequest = async ({
  consentId,
  postId,
  revision,
}: {
  readonly consentId: string;
  readonly postId: string;
  readonly revision: number;
}): Promise<void> => {
  const consent = await db
    .select({
      quoteAuthorActorUri: PostQuoteConsents.quoteAuthorActorUri,
      quoteAuthorProfileId: QuoteAuthorProfiles.id,
      quoteUri: PostQuoteConsents.quoteUri,
      requestUri: PostQuoteConsents.requestUri,
      sourceUri: PostQuoteConsents.sourceUri,
      sourceAuthorProfileId: Profiles.id,
      sourceInboxUri: SourceActors.inboxUri,
      sourceActorUri: SourceActors.uri,
    })
    .from(PostQuoteConsents)
    .innerJoin(Posts, eq(Posts.id, PostQuoteConsents.sourcePostId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      SourceActors,
      and(
        eq(SourceActors.profileId, Profiles.id),
        eq(SourceActors.uri, PostQuoteConsents.sourceAuthorActorUri),
      ),
    )
    .innerJoin(
      QuoteAuthorProfiles,
      eq(QuoteAuthorProfiles.id, PostQuoteConsents.quoteAuthorProfileId),
    )
    .innerJoin(QuoteAuthorInstances, eq(QuoteAuthorInstances.id, QuoteAuthorProfiles.instanceId))
    .where(
      and(
        eq(PostQuoteConsents.id, consentId),
        eq(PostQuoteConsents.quotePostId, postId),
        eq(PostQuoteConsents.revision, revision),
        eq(PostQuoteConsents.status, PostQuoteConsentStatus.PENDING),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(QuoteAuthorInstances.kind, InstanceKind.LOCAL),
        eq(QuoteAuthorInstances.state, InstanceState.ACTIVE),
        eq(QuoteAuthorProfiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (
    !consent ||
    !consent.quoteAuthorProfileId ||
    !consent.sourceActorUri ||
    !consent.sourceInboxUri
  ) {
    return;
  }

  const quotePost = await db
    .select({
      authorProfileId: Profiles.id,
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        isNotNull(Posts.currentContentId),
      ),
    )
    .limit(1)
    .then(first);
  if (!quotePost?.canonicalOrigin) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(quotePost.canonicalOrigin), {
    localInstanceId: quotePost.localInstanceId,
  });
  const instrument = await projectLocalPostQuoteRequestInstrument(
    context,
    postId,
    consent.sourceUri,
    consent.sourceActorUri,
  );
  if (!instrument || instrument.id?.href !== consent.quoteUri) {
    return;
  }

  const activity = new QuoteRequest({
    actor: context.getActorUri(consent.quoteAuthorProfileId),
    id: new URL(consent.requestUri),
    instrument,
    object: new URL(consent.sourceUri),
    tos: [new URL(consent.sourceActorUri)],
  });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: consent.quoteAuthorProfileId,
    context,
    directProfileIds: [consent.sourceAuthorProfileId],
    includeFollowers: false,
  });
};

export const sendLocalPostQuoteDecision = async ({
  consentId,
  revision,
  sourcePostId,
}: {
  readonly consentId: string;
  readonly revision: number;
  readonly sourcePostId: string;
}): Promise<void> => {
  const decision = await db
    .select({
      approvalUri: PostQuoteConsents.approvalUri,
      quoteAuthorActorUri: QuoteAuthorActors.uri,
      quoteAuthorProfileId: QuoteAuthorProfiles.id,
      quoteUri: PostQuoteConsents.quoteUri,
      requestUri: PostQuoteConsents.requestUri,
      revision: PostQuoteConsents.revision,
      sourceAuthorActorUri: PostQuoteConsents.sourceAuthorActorUri,
      sourceAuthorProfileId: Profiles.id,
      sourceCanonicalOrigin: Instances.canonicalOrigin,
      sourceInstanceId: Instances.id,
      sourceUri: PostQuoteConsents.sourceUri,
      status: PostQuoteConsents.status,
    })
    .from(PostQuoteConsents)
    .innerJoin(Posts, eq(Posts.id, PostQuoteConsents.sourcePostId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      QuoteAuthorProfiles,
      eq(QuoteAuthorProfiles.id, PostQuoteConsents.quoteAuthorProfileId),
    )
    .innerJoin(QuoteAuthorInstances, eq(QuoteAuthorInstances.id, QuoteAuthorProfiles.instanceId))
    .innerJoin(
      QuoteAuthorActors,
      and(
        eq(QuoteAuthorActors.profileId, QuoteAuthorProfiles.id),
        eq(QuoteAuthorActors.uri, PostQuoteConsents.quoteAuthorActorUri),
      ),
    )
    .where(
      and(
        eq(PostQuoteConsents.id, consentId),
        eq(PostQuoteConsents.revision, revision),
        eq(PostQuoteConsents.sourcePostId, sourcePostId),
        inArray(PostQuoteConsents.status, [
          PostQuoteConsentStatus.APPROVED,
          PostQuoteConsentStatus.REJECTED,
        ]),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(QuoteAuthorInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(QuoteAuthorInstances.state, InstanceState.ACTIVE),
        eq(QuoteAuthorProfiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!decision?.sourceCanonicalOrigin) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(decision.sourceCanonicalOrigin), {
    localInstanceId: decision.sourceInstanceId,
  });
  const sourceActor = new URL(decision.sourceAuthorActorUri);
  const quoteActor = new URL(decision.quoteAuthorActorUri);
  const sourceUri = new URL(decision.sourceUri);
  const quoteUri = new URL(decision.quoteUri);
  const requestUri = new URL(decision.requestUri);
  const instrument = new Note({
    attribution: quoteActor,
    id: quoteUri,
    quote: sourceUri,
    quoteUrl: sourceUri,
  });
  const request = new QuoteRequest({
    actor: quoteActor,
    id: requestUri,
    instrument,
    object: sourceUri,
    tos: [sourceActor],
  });
  const activity =
    decision.status === PostQuoteConsentStatus.APPROVED
      ? new Accept({
          actor: sourceActor,
          id: new URL(`#accept-${decision.revision}`, requestUri),
          object: request,
          result:
            decision.approvalUri === null
              ? undefined
              : new QuoteAuthorization({
                  attribution: sourceActor,
                  id: new URL(decision.approvalUri),
                  interactingObject: quoteUri,
                  interactionTarget: sourceUri,
                }),
          tos: [quoteActor],
        })
      : new Reject({
          actor: sourceActor,
          id: new URL(`#reject-${decision.revision}`, requestUri),
          object: request,
          tos: [quoteActor],
        });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: decision.sourceAuthorProfileId,
    context,
    directProfileIds: [decision.quoteAuthorProfileId],
    includeFollowers: false,
  });
};

type LocalPostQuoteRevocation = {
  readonly approvalUri: string | null;
  readonly id: string;
  readonly quoteAuthorActorRecordUri: string | null;
  readonly quoteAuthorActorUri: string;
  readonly quoteAuthorInstanceKind: InstanceKind;
  readonly quoteAuthorProfileId: string;
  readonly quotePostId: string | null;
  readonly revision: number;
  readonly sourceAuthorProfileId: string;
  readonly sourceCanonicalOrigin: string | null;
  readonly sourceInstanceId: string;
  readonly sourceUri: string;
};

const loadLocalPostQuoteRevocation = async (
  consentId: string,
  sourcePostId: string,
  revision: number,
): Promise<LocalPostQuoteRevocation | null> =>
  db
    .select({
      approvalUri: PostQuoteConsents.approvalUri,
      id: PostQuoteConsents.id,
      quoteAuthorActorRecordUri: QuoteAuthorActors.uri,
      quoteAuthorActorUri: PostQuoteConsents.quoteAuthorActorUri,
      quoteAuthorInstanceKind: QuoteAuthorInstances.kind,
      quoteAuthorProfileId: QuoteAuthorProfiles.id,
      quotePostId: PostQuoteConsents.quotePostId,
      revision: PostQuoteConsents.revision,
      sourceAuthorProfileId: Profiles.id,
      sourceCanonicalOrigin: Instances.canonicalOrigin,
      sourceInstanceId: Instances.id,
      sourceUri: PostQuoteConsents.sourceUri,
    })
    .from(PostQuoteConsents)
    .innerJoin(Posts, eq(Posts.id, PostQuoteConsents.sourcePostId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      QuoteAuthorProfiles,
      eq(QuoteAuthorProfiles.id, PostQuoteConsents.quoteAuthorProfileId),
    )
    .innerJoin(QuoteAuthorInstances, eq(QuoteAuthorInstances.id, QuoteAuthorProfiles.instanceId))
    .leftJoin(
      QuoteAuthorActors,
      and(
        eq(QuoteAuthorActors.profileId, QuoteAuthorProfiles.id),
        eq(QuoteAuthorActors.uri, PostQuoteConsents.quoteAuthorActorUri),
      ),
    )
    .where(
      and(
        eq(PostQuoteConsents.id, consentId),
        eq(PostQuoteConsents.sourcePostId, sourcePostId),
        eq(PostQuoteConsents.revision, revision),
        eq(PostQuoteConsents.status, PostQuoteConsentStatus.REVOKED),
        isNotNull(PostQuoteConsents.approvalUri),
        eq(Posts.state, PostState.DELETED),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        inArray(QuoteAuthorInstances.kind, [InstanceKind.LOCAL, InstanceKind.ACTIVITYPUB]),
        eq(QuoteAuthorInstances.state, InstanceState.ACTIVE),
        eq(QuoteAuthorProfiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

const dispatchLocalPostQuoteRevocation = async (
  consent: LocalPostQuoteRevocation,
): Promise<void> => {
  if (!consent.approvalUri || !consent.sourceCanonicalOrigin) {
    return;
  }

  if (consent.quoteAuthorInstanceKind === InstanceKind.LOCAL) {
    if (!consent.quotePostId) {
      return;
    }
    await sendLocalPostConsentUpdate({
      consentId: consent.id,
      postId: consent.quotePostId,
      revision: consent.revision,
    });
    return;
  }
  if (!consent.quoteAuthorActorRecordUri) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(consent.sourceCanonicalOrigin), {
    localInstanceId: consent.sourceInstanceId,
  });
  const activity = new Delete({
    actor: context.getActorUri(consent.sourceAuthorProfileId),
    id: new URL(`#revoke-${consent.revision}`, new URL(consent.approvalUri)),
    object: new URL(consent.approvalUri),
    target: new URL(consent.sourceUri),
    tos: [new URL(consent.quoteAuthorActorRecordUri)],
  });
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: consent.sourceAuthorProfileId,
    context,
    directProfileIds: [consent.quoteAuthorProfileId],
    includeFollowers: false,
  });
};

export const sendLocalPostQuoteRevocation = async ({
  consentId,
  revision,
  sourcePostId,
}: {
  readonly consentId: string;
  readonly revision: number;
  readonly sourcePostId: string;
}): Promise<void> => {
  const consent = await loadLocalPostQuoteRevocation(consentId, sourcePostId, revision);
  if (consent) {
    await dispatchLocalPostQuoteRevocation(consent);
  }
};

export const sendLocalPostQuoteRevocations = async (sourcePostId: string): Promise<void> => {
  const source = await db
    .select({
      approvalUri: PostQuoteConsents.approvalUri,
      id: PostQuoteConsents.id,
      quoteAuthorActorRecordUri: QuoteAuthorActors.uri,
      quoteAuthorActorUri: PostQuoteConsents.quoteAuthorActorUri,
      quoteAuthorInstanceKind: QuoteAuthorInstances.kind,
      quoteAuthorProfileId: QuoteAuthorProfiles.id,
      quotePostId: PostQuoteConsents.quotePostId,
      revision: PostQuoteConsents.revision,
      sourceAuthorProfileId: Profiles.id,
      sourceCanonicalOrigin: Instances.canonicalOrigin,
      sourceInstanceId: Instances.id,
      sourceUri: PostQuoteConsents.sourceUri,
    })
    .from(PostQuoteConsents)
    .innerJoin(Posts, eq(Posts.id, PostQuoteConsents.sourcePostId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      QuoteAuthorProfiles,
      eq(QuoteAuthorProfiles.id, PostQuoteConsents.quoteAuthorProfileId),
    )
    .innerJoin(QuoteAuthorInstances, eq(QuoteAuthorInstances.id, QuoteAuthorProfiles.instanceId))
    .leftJoin(
      QuoteAuthorActors,
      and(
        eq(QuoteAuthorActors.profileId, QuoteAuthorProfiles.id),
        eq(QuoteAuthorActors.uri, PostQuoteConsents.quoteAuthorActorUri),
      ),
    )
    .where(
      and(
        eq(PostQuoteConsents.sourcePostId, sourcePostId),
        eq(PostQuoteConsents.status, PostQuoteConsentStatus.REVOKED),
        isNotNull(PostQuoteConsents.approvalUri),
        eq(Posts.state, PostState.DELETED),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        inArray(QuoteAuthorInstances.kind, [InstanceKind.LOCAL, InstanceKind.ACTIVITYPUB]),
        eq(QuoteAuthorInstances.state, InstanceState.ACTIVE),
        eq(QuoteAuthorProfiles.state, ProfileState.ACTIVE),
      ),
    );
  if (source.length === 0) {
    return;
  }

  let firstFailure: unknown;
  for (const consent of source) {
    try {
      await dispatchLocalPostQuoteRevocation(consent);
    } catch (error) {
      firstFailure ??= error;
      console.error('Local Quote revocation delivery failed', {
        consentId: consent.id,
        error,
        sourcePostId,
      });
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
        ne(Posts.visibility, PostVisibility.DIRECT),
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

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(source.authorProfileId);
  const followersUri = getFollowersUri(actorUri);
  const objectUri = noteUri(source.canonicalOrigin, postId);
  const activity = new Delete({
    actor: actorUri,
    ccs:
      source.visibility === PostVisibility.PUBLIC
        ? [followersUri]
        : source.visibility === PostVisibility.UNLISTED
          ? [PUBLIC_COLLECTION]
          : [],
    id: new URL('#delete', objectUri),
    object: objectUri,
    published: source.deletedAt,
    tos: source.visibility === PostVisibility.PUBLIC ? [PUBLIC_COLLECTION] : [followersUri],
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
    directProfileIds: directProfileId ? [directProfileId] : [],
  });
};
