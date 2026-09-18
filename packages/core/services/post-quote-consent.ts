import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  PostQuoteConsents,
  PostQuoteEffectReceipts,
  PostQuotePolicies,
  PostQuoteRevocations,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostQuoteEffectKind,
  PostQuoteEffectReceiptStatus,
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { temporalClient } from '../temporal/client';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import type { DatabaseHandle, Transaction } from '../db';

export const defaultPostQuotePolicy = PostQuotePolicy.EVERYONE;

export type PostQuoteConsentRow = typeof PostQuoteConsents.$inferSelect;
export type PostQuoteEffectReceiptRow = typeof PostQuoteEffectReceipts.$inferSelect;

type InboundQuoteRevocationIdentity = {
  readonly approvalUri: string;
  readonly quoteUri?: string | null;
  readonly sourceAuthorActorUri: string;
  readonly sourceUri: string;
};

const storeInboundQuoteRevocation = async (
  database: DatabaseHandle,
  { approvalUri, quoteUri, sourceAuthorActorUri, sourceUri }: InboundQuoteRevocationIdentity,
) => {
  await database
    .insert(PostQuoteRevocations)
    .values({ approvalUri, quoteUri: quoteUri ?? null, sourceAuthorActorUri, sourceUri })
    .onConflictDoNothing({ target: PostQuoteRevocations.approvalUri });
  return database
    .select()
    .from(PostQuoteRevocations)
    .where(eq(PostQuoteRevocations.approvalUri, approvalUri))
    .limit(1)
    .then(first);
};

type PostQuoteEffectReceiptInput = {
  readonly approvalUri?: string | null;
  readonly consentId?: string | null;
  readonly effectKey: string;
  readonly effectKind: PostQuoteEffectKind;
  readonly postId?: string | null;
  readonly quoteAuthorActorUri?: string | null;
  readonly quoteUri?: string | null;
  readonly requestUri?: string | null;
  readonly revision: number;
  readonly sourceAuthorActorUri?: string | null;
  readonly sourcePostId?: string | null;
  readonly sourceUri?: string | null;
  readonly targetInboxUri?: string | null;
  readonly targetSharedInboxUri?: string | null;
};

export const createPostQuoteEffectReceipt = async (
  tx: Transaction,
  values: PostQuoteEffectReceiptInput,
): Promise<PostQuoteEffectReceiptRow> => {
  const inserted = await tx
    .insert(PostQuoteEffectReceipts)
    .values({
      approvalUri: values.approvalUri ?? null,
      consentId: values.consentId ?? null,
      effectKey: values.effectKey,
      effectKind: values.effectKind,
      postId: values.postId ?? null,
      quoteAuthorActorUri: values.quoteAuthorActorUri ?? null,
      quoteUri: values.quoteUri ?? null,
      requestUri: values.requestUri ?? null,
      revision: values.revision,
      sourceAuthorActorUri: values.sourceAuthorActorUri ?? null,
      sourcePostId: values.sourcePostId ?? null,
      sourceUri: values.sourceUri ?? null,
      targetInboxUri: values.targetInboxUri ?? null,
      targetSharedInboxUri: values.targetSharedInboxUri ?? null,
    })
    .onConflictDoNothing({ target: PostQuoteEffectReceipts.effectKey })
    .returning()
    .then(first);
  if (inserted) {
    return inserted;
  }

  const existing = await tx
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.effectKey, values.effectKey))
    .limit(1)
    .then(first);
  if (!existing) {
    throw new Error('Post Quote Effect receipt not found after insert conflict');
  }
  return existing;
};

export const completePostQuoteEffectReceipt = async (receiptId: string): Promise<void> => {
  await db
    .update(PostQuoteEffectReceipts)
    .set({
      completedAt: sql`now()`,
      status: PostQuoteEffectReceiptStatus.COMPLETED,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(PostQuoteEffectReceipts.id, receiptId),
        eq(PostQuoteEffectReceipts.status, PostQuoteEffectReceiptStatus.PENDING),
      ),
    );
};

const quoteEffectWorkflowOptions = {
  taskQueue: KOSMO_TASK_QUEUE,
  workflowIdConflictPolicy: 'USE_EXISTING',
  workflowIdReusePolicy: 'ALLOW_DUPLICATE',
} as const;

const startPostQuoteEffectWorkflow = async (receipt: PostQuoteEffectReceiptRow): Promise<void> => {
  if (receipt.effectKind === PostQuoteEffectKind.POLICY_UPDATE && receipt.postId !== null) {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postQuotePolicyEffectsWorkflow', {
        ...quoteEffectWorkflowOptions,
        args: [{ postId: receipt.postId, receiptId: receipt.id, revision: receipt.revision }],
        workflowId: `post-quote-policy-effects:${receipt.postId}:${receipt.revision}`,
      }),
    );
    return;
  }

  if (
    receipt.effectKind === PostQuoteEffectKind.CONSENT_UPDATE &&
    receipt.consentId !== null &&
    receipt.postId !== null
  ) {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postQuoteConsentEffectsWorkflow', {
        ...quoteEffectWorkflowOptions,
        args: [
          {
            consentId: receipt.consentId,
            postId: receipt.postId,
            receiptId: receipt.id,
            revision: receipt.revision,
          },
        ],
        workflowId: `post-quote-consent-effects:${receipt.consentId}:${receipt.revision}`,
      }),
    );
    return;
  }

  if (
    receipt.effectKind === PostQuoteEffectKind.QUOTE_REQUEST &&
    receipt.consentId !== null &&
    receipt.postId !== null
  ) {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postQuoteRequestEffectsWorkflow', {
        ...quoteEffectWorkflowOptions,
        args: [
          {
            consentId: receipt.consentId,
            postId: receipt.postId,
            receiptId: receipt.id,
            revision: receipt.revision,
          },
        ],
        workflowId: `post-quote-request-effects:${receipt.consentId}:${receipt.revision}`,
      }),
    );
    return;
  }

  if (
    receipt.effectKind === PostQuoteEffectKind.SOURCE_REVOCATION &&
    receipt.consentId !== null &&
    receipt.sourcePostId !== null
  ) {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postQuoteRevocationEffectsWorkflow', {
        ...quoteEffectWorkflowOptions,
        args: [
          {
            consentId: receipt.consentId,
            receiptId: receipt.id,
            revision: receipt.revision,
            sourcePostId: receipt.sourcePostId,
          },
        ],
        workflowId: `post-quote-revocation-effects:${receipt.consentId}:${receipt.revision}`,
      }),
    );
    return;
  }

  if (
    receipt.effectKind === PostQuoteEffectKind.QUOTE_DECISION &&
    receipt.consentId !== null &&
    receipt.sourcePostId !== null
  ) {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postQuoteDecisionEffectsWorkflow', {
        ...quoteEffectWorkflowOptions,
        args: [
          {
            consentId: receipt.consentId,
            receiptId: receipt.id,
            revision: receipt.revision,
            sourcePostId: receipt.sourcePostId,
          },
        ],
        workflowId: `post-quote-decision-effects:${receipt.consentId}:${receipt.revision}`,
      }),
    );
    return;
  }

  throw new Error(`Post Quote Effect receipt ${receipt.id} has incomplete identity`);
};

export const startPostQuoteEffect = async (receiptId: string): Promise<void> => {
  const receipt = await db
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.id, receiptId))
    .limit(1)
    .then(first);
  if (!receipt || receipt.status === PostQuoteEffectReceiptStatus.COMPLETED) {
    return;
  }
  await startPostQuoteEffectWorkflow(receipt);
};

export const replayPendingPostQuoteEffects = async (limit = 100): Promise<number> => {
  const batchSize = Math.max(1, Math.min(limit, 100));
  let cursor: Pick<PostQuoteEffectReceiptRow, 'createdAt' | 'id'> | null = null;
  let started = 0;
  while (true) {
    const afterCursor: ReturnType<typeof or> = cursor
      ? or(
          gt(PostQuoteEffectReceipts.createdAt, cursor.createdAt),
          and(
            eq(PostQuoteEffectReceipts.createdAt, cursor.createdAt),
            gt(PostQuoteEffectReceipts.id, cursor.id),
          ),
        )
      : undefined;
    const receipts: PostQuoteEffectReceiptRow[] = await db
      .select()
      .from(PostQuoteEffectReceipts)
      .where(
        afterCursor
          ? and(
              eq(PostQuoteEffectReceipts.status, PostQuoteEffectReceiptStatus.PENDING),
              afterCursor,
            )
          : eq(PostQuoteEffectReceipts.status, PostQuoteEffectReceiptStatus.PENDING),
      )
      .orderBy(asc(PostQuoteEffectReceipts.createdAt), asc(PostQuoteEffectReceipts.id))
      .limit(batchSize);
    for (const receipt of receipts) {
      try {
        await startPostQuoteEffectWorkflow(receipt);
        started += 1;
      } catch (error) {
        console.error('Pending Post Quote Effect replay failed', {
          effectKind: receipt.effectKind,
          error,
          receiptId: receipt.id,
        });
      }
    }
    const lastReceipt: PostQuoteEffectReceiptRow | undefined = receipts.at(-1);
    if (!lastReceipt || receipts.length < batchSize) {
      break;
    }
    cursor = { createdAt: lastReceipt.createdAt, id: lastReceipt.id };
  }
  return started;
};

const configuredLegacyQuotePostIds = (): ReadonlySet<string> => {
  const values = (process.env.KOSMO_LEGACY_LOCAL_QUOTE_POST_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  // D15 is intentionally opt-in and exact. A partial or malformed rollout
  // value must never turn every missing consent into a legacy exception.
  return values.length === 2 && new Set(values).size === 2 ? new Set(values) : new Set();
};

export const isLegacyLocalQuotePost = (postId: string): boolean =>
  configuredLegacyQuotePostIds().has(postId);

export const updatePostQuotePolicy = async ({
  actorProfileId,
  policy,
  postId,
}: {
  readonly actorProfileId: string;
  readonly policy: PostQuotePolicy;
  readonly postId: string;
}): Promise<PostQuotePolicy> => {
  assertPostQuotePolicy(policy);
  const result = await db.transaction(async (tx) => {
    const post = await tx
      .select({
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        post: Posts,
        profileState: Profiles.state,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, postId))
      .limit(1)
      .then(first);

    if (
      !post ||
      post.instanceKind !== InstanceKind.LOCAL ||
      post.instanceState === InstanceState.SUSPENDED ||
      post.post.state !== PostState.ACTIVE ||
      post.post.currentContentId === null ||
      post.profileState !== ProfileState.ACTIVE
    ) {
      throw new NotFoundError('Post not found');
    }
    if (post.post.profileId !== actorProfileId) {
      throw new PermissionDeniedError('Post author permission is required');
    }

    const existing = await tx
      .update(PostQuotePolicies)
      .set({
        policy,
        revision: sql`${PostQuotePolicies.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(PostQuotePolicies.postId, postId))
      .returning({ policy: PostQuotePolicies.policy, revision: PostQuotePolicies.revision })
      .then(first);

    const policyRow =
      existing ??
      (await tx
        .insert(PostQuotePolicies)
        .values({ postId, policy })
        .onConflictDoNothing()
        .returning({ policy: PostQuotePolicies.policy, revision: PostQuotePolicies.revision })
        .then(first)) ??
      (await tx
        .select({ policy: PostQuotePolicies.policy, revision: PostQuotePolicies.revision })
        .from(PostQuotePolicies)
        .where(eq(PostQuotePolicies.postId, postId))
        .limit(1)
        .then(first));
    if (!policyRow) {
      throw new Error('Post Quote Policy not found after insert conflict');
    }

    const receipt = await createPostQuoteEffectReceipt(tx, {
      effectKey: `post-quote-policy:${postId}:${policyRow.revision}`,
      effectKind: PostQuoteEffectKind.POLICY_UPDATE,
      postId,
      revision: policyRow.revision,
    });
    return { ...policyRow, receiptId: receipt.id };
  });

  try {
    await startPostQuoteEffect(result.receiptId);
  } catch (error) {
    console.error('Post Quote Policy Workflow start failed', {
      error,
      postId,
      receiptId: result.receiptId,
      revision: result.revision,
    });
  }

  return result.policy;
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
        .select({ policy: PostQuotePolicies.policy })
        .from(PostQuotePolicies)
        .where(eq(PostQuotePolicies.postId, sourcePostId))
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
    readonly quoteAuthorProfileId: string | null;
    readonly quotePostId: string | null;
    readonly quoteUri: string;
    readonly requestUri: string;
    readonly sourceAuthorActorUri: string;
    readonly sourcePostId: string;
    readonly sourceUri: string;
    readonly status: PostQuoteConsentStatus;
  },
): Promise<PostQuoteConsentRow> => {
  const inserted = await tx
    .insert(PostQuoteConsents)
    .values(values)
    .onConflictDoNothing({
      target: [
        PostQuoteConsents.sourcePostId,
        PostQuoteConsents.quoteUri,
        PostQuoteConsents.quoteAuthorActorUri,
      ],
    })
    .returning()
    .then(first);
  if (inserted) {
    return inserted;
  }

  const existing = await tx
    .select()
    .from(PostQuoteConsents)
    .where(
      and(
        eq(PostQuoteConsents.sourcePostId, values.sourcePostId),
        eq(PostQuoteConsents.quoteUri, values.quoteUri),
        eq(PostQuoteConsents.quoteAuthorActorUri, values.quoteAuthorActorUri),
      ),
    )
    .limit(1)
    .then(first);
  if (!existing) {
    throw new Error('Quote consent not found after insert conflict');
  }
  return existing;
};

type InboundQuoteRequestInput = {
  readonly approvalUri: string;
  readonly quoteAuthorActorUri: string;
  readonly quoteAuthorProfileId: string;
  readonly quotePostId: string | null;
  readonly quoteUri: string;
  readonly requestUri: string;
  readonly sourceAuthorActorUri: string;
  readonly sourcePostId: string;
  readonly sourceUri: string;
};

const createQuoteDecisionReceipt = async (
  tx: Transaction,
  consent: PostQuoteConsentRow,
): Promise<PostQuoteEffectReceiptRow> =>
  createPostQuoteEffectReceipt(tx, {
    approvalUri: consent.approvalUri,
    consentId: consent.id,
    effectKey: `post-quote-decision:${consent.id}:${consent.revision}`,
    effectKind: PostQuoteEffectKind.QUOTE_DECISION,
    postId: consent.sourcePostId,
    quoteAuthorActorUri: consent.quoteAuthorActorUri,
    quoteUri: consent.quoteUri,
    requestUri: consent.requestUri,
    revision: consent.revision,
    sourceAuthorActorUri: consent.sourceAuthorActorUri,
    sourcePostId: consent.sourcePostId,
    sourceUri: consent.sourceUri,
  });

export type InboundQuoteRequestResult = {
  readonly accepted: boolean;
  readonly consent: PostQuoteConsentRow;
  readonly receiptId: string | null;
};

export const recordInboundQuoteRequest = async (
  values: InboundQuoteRequestInput,
): Promise<InboundQuoteRequestResult> =>
  db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(PostQuoteConsents)
      .where(
        and(
          eq(PostQuoteConsents.sourcePostId, values.sourcePostId),
          eq(PostQuoteConsents.quoteUri, values.quoteUri),
          eq(PostQuoteConsents.quoteAuthorActorUri, values.quoteAuthorActorUri),
        ),
      )
      .limit(1)
      .then(first);

    if (existing && existing.status !== PostQuoteConsentStatus.PENDING) {
      const receipt = await tx
        .select({ id: PostQuoteEffectReceipts.id })
        .from(PostQuoteEffectReceipts)
        .where(
          and(
            eq(PostQuoteEffectReceipts.consentId, existing.id),
            eq(PostQuoteEffectReceipts.effectKind, PostQuoteEffectKind.QUOTE_DECISION),
            eq(PostQuoteEffectReceipts.revision, existing.revision),
          ),
        )
        .limit(1)
        .then(first);
      return {
        accepted: existing.status === PostQuoteConsentStatus.APPROVED,
        consent: existing,
        receiptId: receipt?.id ?? null,
      };
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
        .update(PostQuoteConsents)
        .set({
          approvalUri: accepted ? values.approvalUri : null,
          quoteAuthorProfileId: values.quoteAuthorProfileId,
          quotePostId: values.quotePostId,
          revision: sql`${PostQuoteConsents.revision} + 1`,
          status,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(PostQuoteConsents.id, existing.id),
            eq(PostQuoteConsents.status, PostQuoteConsentStatus.PENDING),
          ),
        )
        .returning()
        .then(first);
      if (updated) {
        const receipt = await createQuoteDecisionReceipt(tx, updated);
        return { accepted, consent: updated, receiptId: receipt.id };
      }

      const current = await tx
        .select()
        .from(PostQuoteConsents)
        .where(eq(PostQuoteConsents.id, existing.id))
        .limit(1)
        .then(first);
      if (!current) {
        throw new Error('Quote consent disappeared during inbound request');
      }
      return {
        accepted: current.status === PostQuoteConsentStatus.APPROVED,
        consent: current,
        receiptId: null,
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
    const receipt = await createQuoteDecisionReceipt(tx, consent);
    return { accepted, consent, receiptId: receipt.id };
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
      .select()
      .from(PostQuoteConsents)
      .where(eq(PostQuoteConsents.requestUri, requestUri))
      .limit(1)
      .then(first);
    if (
      !current ||
      current.status !== PostQuoteConsentStatus.PENDING ||
      current.quoteUri !== quoteUri ||
      current.sourceUri !== sourceUri ||
      current.sourceAuthorActorUri !== sourceAuthorActorUri
    ) {
      return null;
    }

    if (!current.quoteAuthorProfileId) {
      return null;
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

    if (current.quotePostId) {
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
    }

    const revocation = await tx
      .select()
      .from(PostQuoteRevocations)
      .where(eq(PostQuoteRevocations.approvalUri, approvalUri))
      .limit(1)
      .then(first);
    if (
      revocation &&
      (revocation.sourceAuthorActorUri !== sourceAuthorActorUri ||
        revocation.sourceUri !== sourceUri ||
        (revocation.quoteUri !== null && revocation.quoteUri !== quoteUri))
    ) {
      return null;
    }

    const updated = await tx
      .update(PostQuoteConsents)
      .set({
        approvalUri,
        revision: sql`${PostQuoteConsents.revision} + 1`,
        status: revocation ? PostQuoteConsentStatus.REVOKED : PostQuoteConsentStatus.APPROVED,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(PostQuoteConsents.id, current.id),
          eq(PostQuoteConsents.status, PostQuoteConsentStatus.PENDING),
        ),
      )
      .returning()
      .then(first)
      .then((row) => row ?? null);
    if (!updated || !updated.quotePostId) {
      return updated ? { consent: updated, receiptId: null } : null;
    }

    const receipt = await createPostQuoteEffectReceipt(tx, {
      approvalUri: updated.approvalUri,
      consentId: updated.id,
      effectKey: `post-quote-consent:${updated.id}:${updated.revision}`,
      effectKind: PostQuoteEffectKind.CONSENT_UPDATE,
      postId: updated.quotePostId,
      quoteAuthorActorUri: updated.quoteAuthorActorUri,
      quoteUri: updated.quoteUri,
      requestUri: updated.requestUri,
      revision: updated.revision,
      sourceAuthorActorUri: updated.sourceAuthorActorUri,
      sourcePostId: updated.sourcePostId,
      sourceUri: updated.sourceUri,
    });
    return { consent: updated, receiptId: receipt.id };
  });
  if (result?.receiptId) {
    try {
      await startPostQuoteEffect(result.receiptId);
    } catch (error) {
      console.error('Post Quote Consent Workflow start failed', {
        consentId: result.consent.id,
        error,
        postId: result.consent.quotePostId,
        receiptId: result.receiptId,
        revision: result.consent.revision,
      });
    }
  }
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
      .select()
      .from(PostQuoteConsents)
      .where(eq(PostQuoteConsents.requestUri, requestUri))
      .limit(1)
      .then(first);
    if (
      !current ||
      current.status !== PostQuoteConsentStatus.PENDING ||
      current.sourceAuthorActorUri !== sourceAuthorActorUri
    ) {
      return null;
    }

    const updated = await tx
      .update(PostQuoteConsents)
      .set({
        revision: sql`${PostQuoteConsents.revision} + 1`,
        status: PostQuoteConsentStatus.REJECTED,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(PostQuoteConsents.id, current.id),
          eq(PostQuoteConsents.status, PostQuoteConsentStatus.PENDING),
        ),
      )
      .returning()
      .then(first)
      .then((row) => row ?? null);
    if (!updated || !updated.quotePostId) {
      return updated ? { consent: updated, receiptId: null } : null;
    }

    const receipt = await createPostQuoteEffectReceipt(tx, {
      approvalUri: updated.approvalUri,
      consentId: updated.id,
      effectKey: `post-quote-consent:${updated.id}:${updated.revision}`,
      effectKind: PostQuoteEffectKind.CONSENT_UPDATE,
      postId: updated.quotePostId,
      quoteAuthorActorUri: updated.quoteAuthorActorUri,
      quoteUri: updated.quoteUri,
      requestUri: updated.requestUri,
      revision: updated.revision,
      sourceAuthorActorUri: updated.sourceAuthorActorUri,
      sourcePostId: updated.sourcePostId,
      sourceUri: updated.sourceUri,
    });
    return { consent: updated, receiptId: receipt.id };
  });
  if (result?.receiptId) {
    try {
      await startPostQuoteEffect(result.receiptId);
    } catch (error) {
      console.error('Post Quote Consent Workflow start failed', {
        consentId: result.consent.id,
        error,
        postId: result.consent.quotePostId,
        receiptId: result.receiptId,
        revision: result.consent.revision,
      });
    }
  }
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
}): Promise<{
  readonly consent: PostQuoteConsentRow;
  readonly forwardingAt: Temporal.Instant | null;
} | null> => {
  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(PostQuoteConsents)
      .where(
        consentId === undefined
          ? eq(PostQuoteConsents.approvalUri, approvalUri)
          : eq(PostQuoteConsents.id, consentId),
      )
      .limit(1)
      .then(first);
    if (
      !current ||
      current.sourceAuthorActorUri !== sourceAuthorActorUri ||
      (current.approvalUri !== null && current.approvalUri !== approvalUri)
    ) {
      return null;
    }

    const revocation = await storeInboundQuoteRevocation(tx, {
      approvalUri,
      quoteUri,
      sourceAuthorActorUri,
      sourceUri,
    });
    if (
      !revocation ||
      revocation.sourceAuthorActorUri !== sourceAuthorActorUri ||
      revocation.sourceUri !== sourceUri ||
      (revocation.quoteUri !== null && revocation.quoteUri !== quoteUri)
    ) {
      return null;
    }

    const claimForwarding = async (eligible: boolean): Promise<Temporal.Instant | null> => {
      if (!eligible || revocation.forwardedAt !== null) {
        return null;
      }
      const claimed = await tx
        .update(PostQuoteRevocations)
        .set({ forwardingAt: sql`now()` })
        .where(
          and(
            eq(PostQuoteRevocations.id, revocation.id),
            isNull(PostQuoteRevocations.forwardedAt),
            or(
              isNull(PostQuoteRevocations.forwardingAt),
              sql`${PostQuoteRevocations.forwardingAt} < now() - interval '5 minutes'`,
            ),
          ),
        )
        .returning({ forwardingAt: PostQuoteRevocations.forwardingAt })
        .then(first);
      return claimed?.forwardingAt ?? null;
    };
    if (current.status === PostQuoteConsentStatus.REVOKED) {
      return { consent: current, forwardingAt: await claimForwarding(true), receiptId: null };
    }
    if (current.status === PostQuoteConsentStatus.REJECTED) {
      return null;
    }

    const updated = await tx
      .update(PostQuoteConsents)
      .set({
        approvalUri: current.approvalUri ?? approvalUri,
        revision: sql`${PostQuoteConsents.revision} + 1`,
        status: PostQuoteConsentStatus.REVOKED,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(PostQuoteConsents.id, current.id),
          inArray(PostQuoteConsents.status, [
            PostQuoteConsentStatus.PENDING,
            PostQuoteConsentStatus.APPROVED,
          ]),
        ),
      )
      .returning()
      .then(first)
      .then((row) => row ?? null);
    if (!updated || !updated.quotePostId) {
      return updated
        ? {
            consent: updated,
            forwardingAt: await claimForwarding(current.status === PostQuoteConsentStatus.APPROVED),
            receiptId: null,
          }
        : null;
    }

    const receipt = await createPostQuoteEffectReceipt(tx, {
      approvalUri: updated.approvalUri,
      consentId: updated.id,
      effectKey: `post-quote-consent:${updated.id}:${updated.revision}`,
      effectKind: PostQuoteEffectKind.CONSENT_UPDATE,
      postId: updated.quotePostId,
      quoteAuthorActorUri: updated.quoteAuthorActorUri,
      quoteUri: updated.quoteUri,
      requestUri: updated.requestUri,
      revision: updated.revision,
      sourceAuthorActorUri: updated.sourceAuthorActorUri,
      sourcePostId: updated.sourcePostId,
      sourceUri: updated.sourceUri,
    });
    return {
      consent: updated,
      forwardingAt: await claimForwarding(current.status === PostQuoteConsentStatus.APPROVED),
      receiptId: receipt.id,
    };
  });
  if (result?.receiptId) {
    try {
      await startPostQuoteEffect(result.receiptId);
    } catch (error) {
      console.error('Post Quote Consent Workflow start failed', {
        consentId: result.consent.id,
        error,
        postId: result.consent.quotePostId,
        receiptId: result.receiptId,
        revision: result.consent.revision,
      });
    }
  }
  return result ? { consent: result.consent, forwardingAt: result.forwardingAt } : null;
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
    .select()
    .from(PostQuoteConsents)
    .where(
      and(
        eq(PostQuoteConsents.status, PostQuoteConsentStatus.PENDING),
        eq(PostQuoteConsents.sourceAuthorActorUri, sourceAuthorActorUri),
        eq(PostQuoteConsents.sourceUri, sourceUri),
        quoteUri === undefined ? undefined : eq(PostQuoteConsents.quoteUri, quoteUri),
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
    .select()
    .from(PostQuoteConsents)
    .where(eq(PostQuoteConsents.requestUri, requestUri))
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const loadQuoteConsentByApprovalUri = async (
  database: DatabaseHandle,
  approvalUri: string,
): Promise<PostQuoteConsentRow | null> =>
  database
    .select()
    .from(PostQuoteConsents)
    .where(eq(PostQuoteConsents.approvalUri, approvalUri))
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const loadQuoteConsentForPost = async (
  database: DatabaseHandle,
  quotePostId: string,
  sourcePostId?: string,
): Promise<PostQuoteConsentRow | null> =>
  database
    .select()
    .from(PostQuoteConsents)
    .where(
      and(
        eq(PostQuoteConsents.quotePostId, quotePostId),
        sourcePostId === undefined ? undefined : eq(PostQuoteConsents.sourcePostId, sourcePostId),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row ?? null);

export const revokePostQuoteConsentsForSource = async (
  tx: Transaction,
  sourcePostId: string,
): Promise<readonly string[]> => {
  const source = await tx
    .select({ instanceKind: Instances.kind })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Posts.id, sourcePostId))
    .limit(1)
    .then(first);
  const revoked = await tx
    .update(PostQuoteConsents)
    .set({
      revision: sql`${PostQuoteConsents.revision} + 1`,
      status: PostQuoteConsentStatus.REVOKED,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(PostQuoteConsents.sourcePostId, sourcePostId),
        inArray(PostQuoteConsents.status, [
          PostQuoteConsentStatus.PENDING,
          PostQuoteConsentStatus.APPROVED,
        ]),
      ),
    )
    .returning();

  const receiptIds: string[] = [];
  for (const consent of revoked) {
    const remoteSourceWithLocalQuote =
      source?.instanceKind === InstanceKind.ACTIVITYPUB && consent.quotePostId !== null;
    if (!remoteSourceWithLocalQuote && !consent.approvalUri) {
      continue;
    }
    const receipt = await createPostQuoteEffectReceipt(tx, {
      approvalUri: consent.approvalUri,
      consentId: consent.id,
      effectKey: remoteSourceWithLocalQuote
        ? `post-quote-consent:${consent.id}:${consent.revision}`
        : `post-quote-revocation:${consent.id}:${consent.revision}`,
      effectKind: remoteSourceWithLocalQuote
        ? PostQuoteEffectKind.CONSENT_UPDATE
        : PostQuoteEffectKind.SOURCE_REVOCATION,
      postId: consent.quotePostId,
      quoteAuthorActorUri: consent.quoteAuthorActorUri,
      quoteUri: consent.quoteUri,
      requestUri: consent.requestUri,
      revision: consent.revision,
      sourceAuthorActorUri: consent.sourceAuthorActorUri,
      sourcePostId: consent.sourcePostId,
      sourceUri: consent.sourceUri,
    });
    receiptIds.push(receipt.id);
  }
  return receiptIds;
};

export const canDisplayQuoteSource = async (
  database: DatabaseHandle,
  {
    quotePostId,
    sourcePostId,
    viewerProfileId,
  }: {
    readonly quotePostId: string;
    readonly sourcePostId: string;
    readonly viewerProfileId?: string | null;
  },
): Promise<boolean> => {
  const [source, quote] = await Promise.all([
    database
      .select({
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
      .where(eq(Posts.id, sourcePostId))
      .limit(1)
      .then(first),
    database
      .select({
        authorProfileId: Posts.profileId,
        currentContentId: Posts.currentContentId,
        instanceState: Instances.state,
        profileState: Profiles.state,
        repostSourceId: Posts.repostSourceId,
        state: Posts.state,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, quotePostId))
      .limit(1)
      .then(first),
  ]);
  if (
    !source ||
    !quote ||
    source.state !== PostState.ACTIVE ||
    source.currentContentId === null ||
    quote.state !== PostState.ACTIVE ||
    quote.profileState !== ProfileState.ACTIVE ||
    quote.instanceState === InstanceState.SUSPENDED
  ) {
    return false;
  }
  if (
    source.profileState !== ProfileState.ACTIVE ||
    source.instanceState === InstanceState.SUSPENDED ||
    source.visibility === PostVisibility.DIRECT
  ) {
    return false;
  }

  if (viewerProfileId && viewerProfileId !== source.authorProfileId) {
    const sourceBlocksViewer = await database
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, source.authorProfileId),
          eq(ProfileBlocks.targetProfileId, viewerProfileId),
        ),
      )
      .limit(1)
      .then(first);
    if (sourceBlocksViewer) {
      return false;
    }
  }

  if (source.visibility === PostVisibility.FOLLOWERS) {
    if (!viewerProfileId || viewerProfileId === source.authorProfileId) {
      return viewerProfileId === source.authorProfileId;
    }
    const follows = await database
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewerProfileId),
          eq(ProfileFollows.followeeProfileId, source.authorProfileId),
        ),
      )
      .limit(1)
      .then(first);
    if (!follows) {
      return false;
    }
  } else if (
    source.visibility !== PostVisibility.PUBLIC &&
    source.visibility !== PostVisibility.UNLISTED
  ) {
    return false;
  }

  // A contentless Post is the existing Repost relation. Its source visibility
  // is decided by the ordinary Post access policy, not quote consent.
  if (quote.currentContentId === null) {
    return true;
  }
  if (source.authorProfileId === quote.authorProfileId) {
    return true;
  }
  if (isLegacyLocalQuotePost(quotePostId) && quote.repostSourceId === sourcePostId) {
    return true;
  }

  const consent = await loadQuoteConsentForPost(database, quotePostId, sourcePostId);
  return consent?.status === PostQuoteConsentStatus.APPROVED;
};

export const assertPostQuotePolicy = (policy: string): PostQuotePolicy => {
  if (!Object.hasOwn(PostQuotePolicy, policy)) {
    throw new ValidationError('Invalid quote policy', { field: 'quotePolicy' });
  }
  return policy as PostQuotePolicy;
};
