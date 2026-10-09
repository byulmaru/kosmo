import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  first,
  Instances,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import type { DatabaseHandle } from '../db';

type QuoteSourceIdentity = {
  readonly authorProfileId: string;
  readonly authorActorUri: string;
  readonly canonicalOrigin: string | null;
  readonly instanceKind: InstanceKind;
  readonly instanceState: InstanceState;
  readonly authorProfileState: ProfileState;
  readonly sourceContentId: string | null;
  readonly sourceState: PostState;
  readonly sourceUri: string | null;
  readonly sourceVisibility: PostVisibility;
};

export const loadQuoteSourceIdentity = async (
  database: DatabaseHandle,
  sourcePostId: string,
): Promise<QuoteSourceIdentity | null> => {
  const row = await database
    .select({
      authorProfileId: Profiles.id,
      authorActorUri: ActivityPubActors.uri,
      canonicalOrigin: Instances.canonicalOrigin,
      domain: Instances.domain,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      authorProfileState: Profiles.state,
      remoteSourceUri: ActivityPubPosts.uri,
      sourceContentId: Posts.currentContentId,
      sourceState: Posts.state,
      sourceVisibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, sourcePostId))
    .limit(1)
    .then(first);
  if (!row) {
    return null;
  }

  const canonicalOrigin =
    row.canonicalOrigin ??
    (row.instanceKind === InstanceKind.LOCAL ? `https://${row.domain}` : null);
  const authorActorUri =
    row.authorActorUri ??
    (canonicalOrigin ? new URL(`/ap/actor/${row.authorProfileId}`, canonicalOrigin).href : null);
  const sourceUri =
    row.remoteSourceUri ??
    (row.instanceKind === InstanceKind.LOCAL && canonicalOrigin
      ? new URL(`/ap/note/${sourcePostId}`, canonicalOrigin).href
      : null);

  return authorActorUri && sourceUri
    ? {
        authorActorUri,
        authorProfileId: row.authorProfileId,
        canonicalOrigin,
        instanceKind: row.instanceKind,
        instanceState: row.instanceState,
        authorProfileState: row.authorProfileState,
        sourceContentId: row.sourceContentId,
        sourceState: row.sourceState,
        sourceUri,
        sourceVisibility: row.sourceVisibility,
      }
    : null;
};

export const loadQuotePostIdentity = async (
  database: DatabaseHandle,
  quotePostId: string,
): Promise<{
  readonly authorActorUri: string;
  readonly quoteUri: string;
  readonly requestUri: string | null;
} | null> => {
  const row = await database
    .select({
      authorActorUri: ActivityPubActors.uri,
      canonicalOrigin: Instances.canonicalOrigin,
      domain: Instances.domain,
      instanceKind: Instances.kind,
      profileId: Profiles.id,
      remoteQuoteUri: ActivityPubPosts.uri,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, quotePostId))
    .limit(1)
    .then(first);
  if (!row) {
    return null;
  }

  const canonicalOrigin = row.canonicalOrigin ?? `https://${row.domain}`;
  const authorActorUri =
    row.authorActorUri ??
    (row.instanceKind === InstanceKind.LOCAL
      ? new URL(`/ap/actor/${row.profileId}`, canonicalOrigin).href
      : null);
  const quoteUri =
    row.remoteQuoteUri ??
    (row.instanceKind === InstanceKind.LOCAL
      ? new URL(`/ap/note/${quotePostId}`, canonicalOrigin).href
      : null);
  const requestUri =
    row.instanceKind === InstanceKind.LOCAL
      ? new URL(`/ap/quote-request/${quotePostId}`, canonicalOrigin).href
      : null;
  return authorActorUri && quoteUri ? { authorActorUri, quoteUri, requestUri } : null;
};

export type QuoteSource = Readonly<{ quotePostId: string; sourcePostId: string }>;

export const visibleQuoteSources = async (
  database: DatabaseHandle,
  {
    quotes,
    viewerProfileId,
  }: {
    readonly quotes: readonly QuoteSource[];
    readonly viewerProfileId?: string | null;
  },
): Promise<QuoteSource[]> => {
  if (!quotes.length) {
    return [];
  }
  const quotePostIds = [...new Set(quotes.map((quote) => quote.quotePostId))];
  const sourcePostIds = [...new Set(quotes.map((quote) => quote.sourcePostId))];
  const posts = await database
    .select({
      id: Posts.id,
      authorProfileId: Posts.profileId,
      currentContentId: Posts.currentContentId,
      instanceState: Instances.state,
      profileState: Profiles.state,
      state: Posts.state,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(inArray(Posts.id, [...new Set([...quotePostIds, ...sourcePostIds])]));
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const sourceAuthorIds = [
    ...new Set(
      sourcePostIds.flatMap((id) => {
        const source = postsById.get(id);
        return source ? [source.authorProfileId] : [];
      }),
    ),
  ];
  const [blocks, follows, consents] = await Promise.all([
    viewerProfileId && sourceAuthorIds.length
      ? database
          .select({ authorProfileId: ProfileBlocks.ownerProfileId })
          .from(ProfileBlocks)
          .where(
            and(
              inArray(ProfileBlocks.ownerProfileId, sourceAuthorIds),
              eq(ProfileBlocks.targetProfileId, viewerProfileId),
            ),
          )
      : [],
    viewerProfileId && sourceAuthorIds.length
      ? database
          .select({ authorProfileId: ProfileFollows.followeeProfileId })
          .from(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.followerProfileId, viewerProfileId),
              inArray(ProfileFollows.followeeProfileId, sourceAuthorIds),
            ),
          )
      : [],
    database
      .select({
        quotePostId: Posts.id,
        sourcePostId: Posts.repostSourceId,
        status: Posts.quoteConsentStatus,
      })
      .from(Posts)
      .where(and(inArray(Posts.id, quotePostIds), inArray(Posts.repostSourceId, sourcePostIds))),
  ]);
  const blockingAuthors = new Set(blocks.map((block) => block.authorProfileId));
  const followedAuthors = new Set(follows.map((follow) => follow.authorProfileId));
  const consentStatuses = new Map<string, PostQuoteConsentStatus>();
  for (const consent of consents) {
    const binding = `${consent.quotePostId}:${consent.sourcePostId}`;
    if (consent.status !== null && !consentStatuses.has(binding)) {
      consentStatuses.set(binding, consent.status);
    }
  }

  return quotes.filter(({ quotePostId, sourcePostId }) => {
    const source = postsById.get(sourcePostId);
    const quote = postsById.get(quotePostId);
    if (
      !source ||
      !quote ||
      source.state !== PostState.ACTIVE ||
      source.currentContentId === null ||
      quote.state !== PostState.ACTIVE ||
      quote.profileState !== ProfileState.ACTIVE ||
      quote.instanceState === InstanceState.SUSPENDED ||
      source.profileState !== ProfileState.ACTIVE ||
      source.instanceState === InstanceState.SUSPENDED ||
      source.visibility === PostVisibility.DIRECT ||
      (viewerProfileId !== source.authorProfileId && blockingAuthors.has(source.authorProfileId))
    ) {
      return false;
    }
    if (source.visibility === PostVisibility.FOLLOWERS) {
      if (!viewerProfileId || viewerProfileId === source.authorProfileId) {
        return viewerProfileId === source.authorProfileId;
      }
      if (!followedAuthors.has(source.authorProfileId)) {
        return false;
      }
    } else if (
      source.visibility !== PostVisibility.PUBLIC &&
      source.visibility !== PostVisibility.UNLISTED
    ) {
      return false;
    }
    // Pure Reposts and self-quotes still use ordinary Source access rules.
    return (
      quote.currentContentId === null ||
      source.authorProfileId === quote.authorProfileId ||
      consentStatuses.get(`${quotePostId}:${sourcePostId}`) === PostQuoteConsentStatus.APPROVED
    );
  });
};

export const canDisplayQuoteSource = async (
  database: DatabaseHandle,
  { viewerProfileId, ...quote }: QuoteSource & { readonly viewerProfileId?: string | null },
): Promise<boolean> =>
  (await visibleQuoteSources(database, { quotes: [quote], viewerProfileId })).length > 0;

export type PostQuoteConsentRow = {
  readonly id: string;
  readonly quotePostId: string;
  readonly quoteAuthorProfileId: string;
  readonly sourcePostId: string;
  readonly sourceUri: string;
  readonly sourceAuthorActorUri: string;
  readonly quoteUri: string;
  readonly quoteAuthorActorUri: string;
  readonly requestUri: string | null;
  readonly approvalUri: string | null;
  readonly status: PostQuoteConsentStatus;
};

export const loadQuoteConsentForPost = async (
  database: DatabaseHandle,
  quotePostId: string,
  sourcePostId?: string,
): Promise<PostQuoteConsentRow | null> => {
  const post = await database
    .select({
      profileId: Posts.profileId,
      sourcePostId: Posts.repostSourceId,
      status: Posts.quoteConsentStatus,
      approvalUri: Posts.quoteConsentApprovalUri,
    })
    .from(Posts)
    .where(
      and(
        eq(Posts.id, quotePostId),
        sourcePostId === undefined ? undefined : eq(Posts.repostSourceId, sourcePostId),
      ),
    )
    .limit(1)
    .then(first);
  if (!post?.sourcePostId || !post.status) {
    return null;
  }
  const [quote, source] = await Promise.all([
    loadQuotePostIdentity(database, quotePostId),
    loadQuoteSourceIdentity(database, post.sourcePostId),
  ]);
  if (!quote || !source?.sourceUri) {
    return null;
  }
  return {
    id: quotePostId,
    quotePostId,
    quoteAuthorProfileId: post.profileId,
    sourcePostId: post.sourcePostId,
    sourceUri: source.sourceUri,
    sourceAuthorActorUri: source.authorActorUri,
    quoteUri: quote.quoteUri,
    quoteAuthorActorUri: quote.authorActorUri,
    requestUri: quote.requestUri,
    approvalUri:
      post.approvalUri ??
      (source.instanceKind === InstanceKind.LOCAL &&
      (post.status === PostQuoteConsentStatus.APPROVED ||
        post.status === PostQuoteConsentStatus.REVOKED) &&
      source.canonicalOrigin
        ? new URL(`/ap/quote-authorization/${quotePostId}`, source.canonicalOrigin).href
        : null),
    status: post.status,
  };
};

const quoteIdFromLocalUri = (uri: string, kind: 'quote-request' | 'quote-authorization') => {
  try {
    const url = new URL(uri);
    const match = new RegExp(
      `^/ap/${kind}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`,
      'i',
    ).exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const loadQuoteConsentByRequestUri = async (
  database: DatabaseHandle,
  requestUri: string,
) => {
  const id = quoteIdFromLocalUri(requestUri, 'quote-request');
  const consent = id ? await loadQuoteConsentForPost(database, id) : null;
  return consent?.requestUri === requestUri ? consent : null;
};

export const loadQuoteConsentByApprovalUri = async (
  database: DatabaseHandle,
  approvalUri: string,
) => {
  const id = quoteIdFromLocalUri(approvalUri, 'quote-authorization');
  if (id) {
    const consent = await loadQuoteConsentForPost(database, id);
    if (consent?.approvalUri === approvalUri) {
      return consent;
    }
  }
  const rows = await database
    .select({ id: Posts.id })
    .from(Posts)
    .where(eq(Posts.quoteConsentApprovalUri, approvalUri))
    .limit(2);
  // An opaque remote URI may bind multiple Quotes. Do not arbitrarily select one.
  return rows.length === 1 ? loadQuoteConsentForPost(database, rows[0]!.id) : null;
};

export const loadPendingQuoteConsentByBinding = async (
  database: DatabaseHandle,
  {
    quoteUri,
    sourceAuthorActorUri,
    sourceUri,
  }: {
    readonly quoteUri?: string;
    readonly sourceAuthorActorUri: string;
    readonly sourceUri: string;
  },
): Promise<PostQuoteConsentRow | null> => {
  const source = await database
    .select({ id: Posts.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        sql`COALESCE(${ActivityPubPosts.uri}, CASE WHEN ${Instances.kind} = 'LOCAL' THEN COALESCE(${Instances.canonicalOrigin}, 'https://' || ${Instances.domain}) || '/ap/note/' || ${Posts.id}::text END) = ${sourceUri}`,
        sql`COALESCE(${ActivityPubActors.uri}, CASE WHEN ${Instances.kind} = 'LOCAL' THEN COALESCE(${Instances.canonicalOrigin}, 'https://' || ${Instances.domain}) || '/ap/actor/' || ${Profiles.id}::text END) = ${sourceAuthorActorUri}`,
      ),
    )
    .limit(2);
  if (source.length !== 1) {
    return null;
  }
  const candidates = await database
    .select({ id: Posts.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(
      and(
        eq(Posts.repostSourceId, source[0]!.id),
        eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING),
        quoteUri === undefined
          ? undefined
          : sql`COALESCE(${ActivityPubPosts.uri}, CASE WHEN ${Instances.kind} = 'LOCAL' THEN COALESCE(${Instances.canonicalOrigin}, 'https://' || ${Instances.domain}) || '/ap/note/' || ${Posts.id}::text END) = ${quoteUri}`,
      ),
    )
    .limit(2);
  return candidates.length === 1 ? loadQuoteConsentForPost(database, candidates[0]!.id) : null;
};
