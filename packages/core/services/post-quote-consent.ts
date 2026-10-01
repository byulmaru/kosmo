import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
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
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { ValidationError } from '../error';
import type { DatabaseHandle, Transaction } from '../db';

export const defaultPostQuotePolicy = PostQuotePolicy.EVERYONE;

// Only select this projection for rows with a recorded consent. The database
// completeness constraint makes its binding and revision non-null in that case.
export const postQuoteConsentColumns = {
  id: Posts.id,
  quotePostId: Posts.id,
  quoteAuthorProfileId: Posts.profileId,
  sourcePostId: sql<string>`${Posts.quoteConsentSourcePostId}`,
  sourceUri: sql<string>`${Posts.quoteConsentSourceUri}`,
  sourceAuthorActorUri: sql<string>`${Posts.quoteConsentSourceAuthorActorUri}`,
  quoteUri: sql<string>`${Posts.quoteConsentQuoteUri}`,
  quoteAuthorActorUri: sql<string>`${Posts.quoteConsentQuoteAuthorActorUri}`,
  requestUri: sql<string>`${Posts.quoteConsentRequestUri}`,
  approvalUri: Posts.quoteConsentApprovalUri,
  status: sql<PostQuoteConsentStatus>`${Posts.quoteConsentStatus}`,
  revision: sql<number>`${Posts.quoteConsentRevision}`,
};

export type PostQuoteConsentRow = {
  readonly id: string;
  readonly quotePostId: string;
  readonly quoteAuthorProfileId: string;
  readonly sourcePostId: string;
  readonly sourceUri: string;
  readonly sourceAuthorActorUri: string;
  readonly quoteUri: string;
  readonly quoteAuthorActorUri: string;
  readonly requestUri: string;
  readonly approvalUri: string | null;
  readonly status: PostQuoteConsentStatus;
  readonly revision: number;
};

export const isLocalQuoteAllowedByPolicy = async (
  tx: Transaction,
  {
    actorProfileId,
    sourceAuthorProfileId,
    sourcePostId,
  }: {
    readonly actorProfileId: string;
    readonly sourceAuthorProfileId: string;
    readonly sourcePostId: string;
  },
): Promise<boolean> => {
  if (actorProfileId === sourceAuthorProfileId) {
    return true;
  }

  const blocked = await tx
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(
      or(
        and(
          eq(ProfileBlocks.ownerProfileId, actorProfileId),
          eq(ProfileBlocks.targetProfileId, sourceAuthorProfileId),
        ),
        and(
          eq(ProfileBlocks.ownerProfileId, sourceAuthorProfileId),
          eq(ProfileBlocks.targetProfileId, actorProfileId),
        ),
      ),
    )
    .limit(1)
    .then(first);
  if (blocked) {
    return false;
  }

  const policy =
    (
      await tx
        .select({ policy: Posts.quotePolicy })
        .from(Posts)
        .where(eq(Posts.id, sourcePostId))
        .limit(1)
        .then(first)
    )?.policy ?? defaultPostQuotePolicy;

  if (policy === PostQuotePolicy.EVERYONE) {
    return true;
  }
  if (policy === PostQuotePolicy.AUTHOR) {
    return false;
  }

  return Boolean(
    await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, actorProfileId),
          eq(ProfileFollows.followeeProfileId, sourceAuthorProfileId),
        ),
      )
      .limit(1)
      .then(first),
  );
};

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

export const createPostQuoteConsent = async (
  tx: Transaction,
  values: {
    readonly approvalUri?: string;
    readonly quoteAuthorActorUri: string;
    readonly quoteAuthorProfileId: string;
    readonly quotePostId: string;
    readonly quoteUri: string;
    readonly requestUri: string;
    readonly sourceAuthorActorUri: string;
    readonly sourcePostId: string;
    readonly sourceUri: string;
    readonly status: PostQuoteConsentStatus;
  },
): Promise<PostQuoteConsentRow> => {
  const recorded = await tx
    .update(Posts)
    .set({
      quoteConsentSourcePostId: values.sourcePostId,
      quoteConsentSourceUri: values.sourceUri,
      quoteConsentSourceAuthorActorUri: values.sourceAuthorActorUri,
      quoteConsentQuoteUri: values.quoteUri,
      quoteConsentQuoteAuthorActorUri: values.quoteAuthorActorUri,
      quoteConsentRequestUri: values.requestUri,
      quoteConsentApprovalUri: values.approvalUri ?? null,
      quoteConsentStatus: values.status,
      quoteConsentRevision: 1,
    })
    .where(
      and(
        eq(Posts.id, values.quotePostId),
        eq(Posts.profileId, values.quoteAuthorProfileId),
        isNull(Posts.quoteConsentStatus),
      ),
    )
    .returning(postQuoteConsentColumns)
    .then(first);
  if (recorded) {
    return recorded;
  }

  const existing = await loadQuoteConsentForPost(tx, values.quotePostId);
  if (
    !existing ||
    existing.sourcePostId !== values.sourcePostId ||
    existing.sourceUri !== values.sourceUri ||
    existing.sourceAuthorActorUri !== values.sourceAuthorActorUri ||
    existing.quoteUri !== values.quoteUri ||
    existing.quoteAuthorActorUri !== values.quoteAuthorActorUri ||
    existing.quoteAuthorProfileId !== values.quoteAuthorProfileId
  ) {
    throw new ValidationError('Quote consent binding does not match the stored Post', {
      field: 'quotePostId',
    });
  }
  // A duplicate binding retains the original request and authorization identities.
  return existing;
};

type InboundQuoteRequestInput = {
  readonly approvalUri: string;
  readonly quoteAuthorActorUri: string;
  readonly quoteAuthorProfileId: string;
  readonly quotePostId: string;
  readonly quoteUri: string;
  readonly requestUri: string;
  readonly sourceAuthorActorUri: string;
  readonly sourcePostId: string;
  readonly sourceUri: string;
};

export type InboundQuoteRequestResult = {
  readonly accepted: boolean;
  readonly consent: PostQuoteConsentRow;
};

export const recordInboundQuoteRequest = async (
  values: InboundQuoteRequestInput,
): Promise<InboundQuoteRequestResult> =>
  db.transaction(async (tx) => {
    const existing = await loadQuoteConsentForPost(tx, values.quotePostId);
    if (
      existing &&
      (existing.sourcePostId !== values.sourcePostId ||
        existing.sourceUri !== values.sourceUri ||
        existing.sourceAuthorActorUri !== values.sourceAuthorActorUri ||
        existing.quoteUri !== values.quoteUri ||
        existing.quoteAuthorActorUri !== values.quoteAuthorActorUri ||
        existing.quoteAuthorProfileId !== values.quoteAuthorProfileId)
    ) {
      throw new ValidationError('Quote consent binding does not match the stored Post', {
        field: 'quotePostId',
      });
    }
    if (
      existing &&
      (existing.status !== PostQuoteConsentStatus.PENDING ||
        existing.requestUri !== values.requestUri)
    ) {
      return { accepted: existing.status === PostQuoteConsentStatus.APPROVED, consent: existing };
    }

    const source = await tx
      .select({
        authorProfileId: Posts.profileId,
        currentContentId: Posts.currentContentId,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        profileState: Profiles.state,
        state: Posts.state,
        visibility: Posts.visibility,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, values.sourcePostId))
      .limit(1)
      .for('update', { of: Posts })
      .then(first);
    const accepted =
      source?.instanceKind === InstanceKind.LOCAL &&
      source.profileState === ProfileState.ACTIVE &&
      source.instanceState !== InstanceState.SUSPENDED &&
      source?.state === PostState.ACTIVE &&
      source.currentContentId !== null &&
      (source.visibility === PostVisibility.PUBLIC ||
        source.visibility === PostVisibility.UNLISTED) &&
      source.authorProfileId !== values.quoteAuthorProfileId &&
      (await isLocalQuoteAllowedByPolicy(tx, {
        actorProfileId: values.quoteAuthorProfileId,
        sourceAuthorProfileId: source.authorProfileId,
        sourcePostId: values.sourcePostId,
      }));
    const status = accepted ? PostQuoteConsentStatus.APPROVED : PostQuoteConsentStatus.REJECTED;

    if (existing) {
      const updated = await tx
        .update(Posts)
        .set({
          quoteConsentApprovalUri: accepted ? values.approvalUri : null,
          quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
          quoteConsentStatus: status,
        })
        .where(
          and(
            eq(Posts.id, existing.id),
            eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING),
          ),
        )
        .returning(postQuoteConsentColumns)
        .then(first);
      if (updated) {
        return { accepted, consent: updated };
      }

      const current = await tx
        .select(postQuoteConsentColumns)
        .from(Posts)
        .where(eq(Posts.id, existing.id))
        .limit(1)
        .then(first);
      if (!current) {
        throw new Error('Quote consent disappeared during inbound request');
      }
      return {
        accepted: current.status === PostQuoteConsentStatus.APPROVED,
        consent: current,
      };
    }

    const consent = await createPostQuoteConsent(tx, {
      approvalUri: accepted ? values.approvalUri : undefined,
      quoteAuthorActorUri: values.quoteAuthorActorUri,
      quoteAuthorProfileId: values.quoteAuthorProfileId,
      quotePostId: values.quotePostId,
      quoteUri: values.quoteUri,
      requestUri: values.requestUri,
      sourceAuthorActorUri: values.sourceAuthorActorUri,
      sourcePostId: values.sourcePostId,
      sourceUri: values.sourceUri,
      status,
    });
    return { accepted, consent };
  });

export const applyInboundQuoteAccept = async ({
  approvalUri,
  quoteUri,
  requestUri,
  sourceAuthorActorUri,
  sourceUri,
}: {
  readonly approvalUri: string;
  readonly quoteUri: string;
  readonly requestUri: string;
  readonly sourceAuthorActorUri: string;
  readonly sourceUri: string;
}): Promise<PostQuoteConsentRow | null> => {
  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.quoteConsentRequestUri, requestUri))
      .limit(1)
      .then(first);
    if (
      !current ||
      current.quoteUri !== quoteUri ||
      current.sourceUri !== sourceUri ||
      current.sourceAuthorActorUri !== sourceAuthorActorUri ||
      (current.approvalUri !== null && current.approvalUri !== approvalUri)
    ) {
      return null;
    }

    // A retried Activity can observe the committed transition or a newer
    // revocation. Preserve the terminal state; never revive a revoked Quote.
    if (current.status === PostQuoteConsentStatus.REVOKED) {
      return null;
    }
    if (current.status !== PostQuoteConsentStatus.PENDING) {
      return current.status === PostQuoteConsentStatus.APPROVED ? { consent: current } : null;
    }

    const source = await loadQuoteSourceIdentity(tx, current.sourcePostId);
    if (
      !source ||
      source.sourceState !== PostState.ACTIVE ||
      source.sourceContentId === null ||
      source.authorProfileState !== ProfileState.ACTIVE ||
      source.instanceState === InstanceState.SUSPENDED ||
      (source.sourceVisibility !== PostVisibility.PUBLIC &&
        source.sourceVisibility !== PostVisibility.UNLISTED) ||
      source.sourceUri !== current.sourceUri ||
      source.authorActorUri !== current.sourceAuthorActorUri ||
      (current.approvalUri !== null && current.approvalUri !== approvalUri) ||
      !(await isLocalQuoteAllowedByPolicy(tx, {
        actorProfileId: current.quoteAuthorProfileId,
        sourceAuthorProfileId: source.authorProfileId,
        sourcePostId: current.sourcePostId,
      }))
    ) {
      return null;
    }

    const quoteIdentity = await loadQuotePostIdentity(tx, current.quotePostId);
    const quotePost = await tx
      .select({
        currentContentId: Posts.currentContentId,
        instanceState: Instances.state,
        profileId: Posts.profileId,
        profileState: Profiles.state,
        repostSourceId: Posts.repostSourceId,
        state: Posts.state,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, current.quotePostId))
      .limit(1)
      .then(first);
    if (
      !quoteIdentity ||
      quoteIdentity.quoteUri !== current.quoteUri ||
      quoteIdentity.authorActorUri !== current.quoteAuthorActorUri ||
      !quotePost ||
      quotePost.state !== PostState.ACTIVE ||
      quotePost.currentContentId === null ||
      quotePost.profileId !== current.quoteAuthorProfileId ||
      quotePost.repostSourceId !== current.sourcePostId ||
      quotePost.profileState !== ProfileState.ACTIVE ||
      quotePost.instanceState === InstanceState.SUSPENDED
    ) {
      return null;
    }

    const updated = await tx
      .update(Posts)
      .set({
        quoteConsentApprovalUri: approvalUri,
        quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
        quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      })
      .where(
        and(eq(Posts.id, current.id), eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING)),
      )
      .returning(postQuoteConsentColumns)
      .then(first)
      .then((row) => row ?? null);
    return updated ? { consent: updated } : null;
  });
  return result?.consent ?? null;
};

export const applyInboundQuoteReject = async ({
  requestUri,
  sourceAuthorActorUri,
}: {
  readonly requestUri: string;
  readonly sourceAuthorActorUri: string;
}): Promise<PostQuoteConsentRow | null> => {
  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.quoteConsentRequestUri, requestUri))
      .limit(1)
      .then(first);
    if (!current || current.sourceAuthorActorUri !== sourceAuthorActorUri) {
      return null;
    }

    // A retried Activity can observe the committed transition or a newer
    // revocation. Preserve the terminal state; never revive a revoked Quote.
    if (current.status === PostQuoteConsentStatus.REVOKED) {
      return null;
    }
    if (current.status !== PostQuoteConsentStatus.PENDING) {
      return current.status === PostQuoteConsentStatus.REJECTED ? { consent: current } : null;
    }

    const updated = await tx
      .update(Posts)
      .set({
        quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
        quoteConsentStatus: PostQuoteConsentStatus.REJECTED,
      })
      .where(
        and(eq(Posts.id, current.id), eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING)),
      )
      .returning(postQuoteConsentColumns)
      .then(first)
      .then((row) => row ?? null);
    return updated ? { consent: updated } : null;
  });
  return result?.consent ?? null;
};

export const applyInboundQuoteRevocation = async ({
  approvalUri,
  consentId,
  quoteUri,
  sourceAuthorActorUri,
  sourceUri,
}: {
  readonly approvalUri: string;
  readonly consentId?: string;
  readonly quoteUri: string;
  readonly sourceAuthorActorUri: string;
  readonly sourceUri: string;
}): Promise<PostQuoteConsentRow | null> => {
  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(
        consentId === undefined
          ? eq(Posts.quoteConsentApprovalUri, approvalUri)
          : and(eq(Posts.id, consentId), isNotNull(Posts.quoteConsentStatus)),
      )
      .limit(1)
      .then(first);
    if (
      !current ||
      current.sourceAuthorActorUri !== sourceAuthorActorUri ||
      current.quoteUri !== quoteUri ||
      current.sourceUri !== sourceUri ||
      (current.approvalUri !== null && current.approvalUri !== approvalUri)
    ) {
      return null;
    }

    if (current.status === PostQuoteConsentStatus.REVOKED) {
      const source = await loadQuoteSourceIdentity(tx, current.sourcePostId);
      // Source deletion already admitted its own durable Quote Update.
      // Remote-revoke retries still need the committed row while Source is active.
      return source?.sourceState === PostState.DELETED ? null : current;
    }
    if (current.status === PostQuoteConsentStatus.REJECTED) {
      return null;
    }

    const updated = await tx
      .update(Posts)
      .set({
        quoteConsentApprovalUri: current.approvalUri ?? approvalUri,
        quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
        quoteConsentStatus: PostQuoteConsentStatus.REVOKED,
      })
      .where(and(eq(Posts.id, current.id), eq(Posts.quoteConsentStatus, current.status)))
      .returning(postQuoteConsentColumns)
      .then(first)
      .then((row) => row ?? null);
    if (!updated) {
      // Retry the Activity against the latest state after a concurrent transition.
      throw new Error('Quote consent changed during revocation');
    }
    return updated;
  });
  return result;
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
  const rows = await database
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(
      and(
        eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING),
        eq(Posts.quoteConsentSourceAuthorActorUri, sourceAuthorActorUri),
        eq(Posts.quoteConsentSourceUri, sourceUri),
        quoteUri === undefined ? undefined : eq(Posts.quoteConsentQuoteUri, quoteUri),
      ),
    )
    .limit(2);
  return rows.length === 1 ? rows[0]! : null;
};

export const loadQuoteConsentByRequestUri = async (
  database: DatabaseHandle,
  requestUri: string,
): Promise<PostQuoteConsentRow | null> =>
  database
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.quoteConsentRequestUri, requestUri))
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const loadQuoteConsentByApprovalUri = async (
  database: DatabaseHandle,
  approvalUri: string,
): Promise<PostQuoteConsentRow | null> =>
  database
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.quoteConsentApprovalUri, approvalUri))
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const loadQuoteConsentForPost = async (
  database: DatabaseHandle,
  quotePostId: string,
  sourcePostId?: string,
): Promise<PostQuoteConsentRow | null> =>
  database
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(
      and(
        eq(Posts.id, quotePostId),
        isNotNull(Posts.quoteConsentStatus),
        sourcePostId === undefined ? undefined : eq(Posts.quoteConsentSourcePostId, sourcePostId),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const revokePostQuoteConsentsForSource = async (
  tx: Transaction,
  sourcePostId: string,
): Promise<void> => {
  // Revoke pending rows first. An Accept racing this statement either loses
  // its PENDING CAS or becomes APPROVED and is captured by the next statement.
  await tx
    .update(Posts)
    .set({
      quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
      quoteConsentStatus: PostQuoteConsentStatus.REVOKED,
    })
    .where(
      and(
        eq(Posts.quoteConsentSourcePostId, sourcePostId),
        eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.PENDING),
      ),
    );
  await tx
    .update(Posts)
    .set({
      quoteConsentRevision: sql`${Posts.quoteConsentRevision} + 1`,
      quoteConsentStatus: PostQuoteConsentStatus.REVOKED,
    })
    .where(
      and(
        eq(Posts.quoteConsentSourcePostId, sourcePostId),
        eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.APPROVED),
      ),
    );
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
        sourcePostId: Posts.quoteConsentSourcePostId,
        status: Posts.quoteConsentStatus,
      })
      .from(Posts)
      .where(
        and(
          inArray(Posts.id, quotePostIds),
          inArray(Posts.quoteConsentSourcePostId, sourcePostIds),
        ),
      ),
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

export const assertPostQuotePolicy = (policy: string): PostQuotePolicy => {
  if (!Object.hasOwn(PostQuotePolicy, policy)) {
    throw new ValidationError('Invalid quote policy', { field: 'quotePolicy' });
  }
  return policy as PostQuotePolicy;
};
