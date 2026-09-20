import '@kosmo/core/polyfill';

import { quoteInteraction } from '@fedify/interaction-controls';
import { Note } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPostQuotes,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubQuoteFormat,
  ActivityPubQuoteStatus,
  InstanceKind,
  PostState,
} from '@kosmo/core/enums';
import { temporalClient } from '@kosmo/core/temporal/client';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri } from './activitypub-uri';
import { materializeHydratedRemoteNote } from './inbound-create-note';
import { RemoteActorDiscoveryUnavailableError } from './remote-actor-materialization';
import type { Context } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type { InboundObservation } from './inbound-observability';

const QuoteTargetActivityPubPosts = alias(
  ActivityPubPosts,
  'inbound_quote_target_activitypub_post',
);
const QuoteTargetPosts = alias(Posts, 'inbound_quote_target_post');
const QuoteTargetProfiles = alias(Profiles, 'inbound_quote_target_profile');
const QuoteTargetActors = alias(ActivityPubActors, 'inbound_quote_target_actor');

type QuoteContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'contextLoader' | 'documentLoader' | 'lookupObject' | 'parseUri'
>;

type InboundQuoteInput = {
  actorUri: string;
  context: QuoteContext;
  note: Note;
  postId: string;
  receivedAt: Temporal.Instant;
  startWorkflow?: boolean;
  expectedRevision?: number;
  authorizationUpdate?: boolean;
};

export type InboundQuoteResolution = {
  retryable: boolean;
  status: ActivityPubQuoteStatus | null;
};

type QuoteExtraction = {
  format: ActivityPubQuoteFormat;
  targetObject: ActivityPubObject | null;
  targetUri: string;
  authorizationId: URL | null;
  authorization: Awaited<ReturnType<Note['getQuoteAuthorization']>>;
  fepPropertyPresent: boolean;
  malformed: boolean;
};

type QuoteSource = {
  actorUri: string | null;
  canonicalOrigin: string | null;
  currentContentId: string | null;
  instanceKind: InstanceKind;
  postId: string;
  postState: string;
  profileId: string;
};

type QuoteResolution = {
  approvalUri: string | null;
  format: ActivityPubQuoteFormat;
  sourcePostId: string | null;
  status: ActivityPubQuoteStatus;
  targetUri: string;
  retryable: boolean;
};

type QuoteTargetResolution =
  | { kind: 'found'; postId: string }
  | { kind: 'permanent_failure' }
  | { kind: 'stale' }
  | { kind: 'transient_failure' };

const fepQuoteUri = 'https://w3id.org/fep/044f#quote';

const getExpandedProperty = async (
  note: Note,
  contextLoader: QuoteContext['contextLoader'],
): Promise<unknown> => {
  try {
    const expanded = await note.toJsonLd({ format: 'expand', contextLoader });
    const document = Array.isArray(expanded) ? expanded[0] : expanded;
    return document && typeof document === 'object'
      ? (document as Record<string, unknown>)[fepQuoteUri]
      : undefined;
  } catch {
    return undefined;
  }
};

export const hasInboundQuote = async ({
  context,
  note,
}: {
  context: QuoteContext;
  note: Note;
}): Promise<boolean> => {
  if (note.quoteId !== null || note.quoteUrl !== null) {
    return true;
  }

  if ((await getExpandedProperty(note, context.contextLoader)) !== undefined) {
    return true;
  }

  try {
    return (
      (await note.getQuote({
        contextLoader: context.contextLoader,
        crossOrigin: 'trust',
        documentLoader: context.documentLoader,
        suppressError: true,
      })) !== null
    );
  } catch {
    return false;
  }
};

const extractQuote = async (context: QuoteContext, note: Note): Promise<QuoteExtraction | null> => {
  const expandedFepQuote = await getExpandedProperty(note, context.contextLoader);
  const fepPropertyPresent = expandedFepQuote !== undefined || note.quoteId !== null;
  const legacyTarget = note.quoteUrl;
  const fepTarget = note.quoteId;

  if (!fepPropertyPresent && legacyTarget === null) {
    return null;
  }

  const format = fepPropertyPresent
    ? ActivityPubQuoteFormat.FEP_044F
    : ActivityPubQuoteFormat.LEGACY;
  const targetUri = fepPropertyPresent ? (fepTarget?.href ?? '') : (legacyTarget?.href ?? '');
  const malformed =
    targetUri.length === 0 ||
    !isHttpUri(new URL(targetUri || 'https://invalid.example')) ||
    (fepPropertyPresent && fepTarget === null);

  return {
    authorization: null,
    authorizationId: note.quoteAuthorizationId,
    fepPropertyPresent,
    format,
    malformed,
    targetObject: null,
    targetUri,
  };
};

const hydrateFepReferences = async (
  context: QuoteContext,
  note: Note,
  extraction: QuoteExtraction,
): Promise<QuoteExtraction> => {
  if (!extraction.fepPropertyPresent || extraction.malformed) {
    return extraction;
  }

  let targetObject: ActivityPubObject | null = null;
  let authorization = null;
  try {
    targetObject = await note.getQuote({
      contextLoader: context.contextLoader,
      crossOrigin: 'trust',
      documentLoader: context.documentLoader,
      suppressError: true,
    });
  } catch {
    targetObject = null;
  }
  try {
    authorization = await note.getQuoteAuthorization({
      contextLoader: context.contextLoader,
      crossOrigin: 'trust',
      documentLoader: context.documentLoader,
      suppressError: true,
    });
  } catch {
    authorization = null;
  }

  return { ...extraction, authorization, targetObject };
};

const loadQuoteSource = async (postId: string): Promise<QuoteSource | null> => {
  const row = await db
    .select({
      actorUri: ActivityPubActors.uri,
      canonicalOrigin: Instances.canonicalOrigin,
      currentContentId: Posts.currentContentId,
      instanceKind: Instances.kind,
      postId: Posts.id,
      postState: Posts.state,
      profileId: Profiles.id,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

  if (!row) {
    return null;
  }

  if (row.actorUri === null && row.instanceKind === InstanceKind.LOCAL && row.canonicalOrigin) {
    return {
      ...row,
      actorUri: new URL(`/ap/actor/${row.profileId}`, row.canonicalOrigin).href,
    };
  }

  return row;
};

const materializeTarget = async ({
  context,
  expectedRevision,
  extraction,
  postId,
  receivedAt,
}: {
  context: QuoteContext;
  expectedRevision?: number;
  extraction: QuoteExtraction;
  postId: string;
  receivedAt: Temporal.Instant;
}): Promise<QuoteTargetResolution> => {
  let targetObject = extraction.targetObject;
  if (targetObject === null) {
    const targetUri = new URL(extraction.targetUri);
    if (!isHttpUri(targetUri)) {
      return { kind: 'permanent_failure' };
    }
    try {
      targetObject = await context.lookupObject(targetUri);
    } catch {
      return { kind: 'transient_failure' };
    }
  }

  if (
    !(targetObject instanceof Note) ||
    !targetObject.id ||
    targetObject.id.href !== extraction.targetUri
  ) {
    return { kind: 'permanent_failure' };
  }

  if (expectedRevision !== undefined) {
    const current = await db
      .select({
        resolutionRevision: ActivityPubPostQuotes.resolutionRevision,
        status: ActivityPubPostQuotes.status,
      })
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, postId))
      .limit(1)
      .then(first);
    if (
      !current ||
      current.resolutionRevision !== expectedRevision ||
      current.status !== ActivityPubQuoteStatus.PENDING
    ) {
      return { kind: 'stale' };
    }
  }

  let materialized;
  try {
    materialized = await materializeHydratedRemoteNote({
      context: {
        ...context,
        lookupObject: async (identifier) => {
          try {
            return await context.lookupObject(identifier);
          } catch (error) {
            throw new RemoteActorDiscoveryUnavailableError('Remote actor lookup failed.', {
              cause: error,
            });
          }
        },
      },
      note: targetObject,
      objectUri: targetObject.id,
      observation: { activityType: 'Create', handler: 'create' } satisfies Pick<
        InboundObservation,
        'activityType' | 'handler'
      >,
      receivedAt,
    });
  } catch (error) {
    if (error instanceof RemoteActorDiscoveryUnavailableError) {
      return { kind: 'transient_failure' };
    }
    throw error;
  }
  return materialized.status === 'rejected'
    ? { kind: 'permanent_failure' }
    : { kind: 'found', postId: materialized.postId };
};

const classifyAuthorization = async ({
  actorUri,
  authorization,
  authorizationId,
  context,
  extraction,
  note,
  source,
}: {
  actorUri: string;
  authorization: QuoteExtraction['authorization'];
  authorizationId: URL | null;
  context: QuoteContext;
  extraction: QuoteExtraction;
  note: Note;
  source: QuoteSource;
}): Promise<{ approvalUri: string | null; retryable: boolean; status: ActivityPubQuoteStatus }> => {
  const suppliedApprovalUri = authorizationId?.href ?? authorization?.id?.href ?? null;
  if (source.actorUri === actorUri) {
    return {
      approvalUri: suppliedApprovalUri,
      retryable: false,
      status: ActivityPubQuoteStatus.APPROVED,
    };
  }

  if (!extraction.fepPropertyPresent) {
    return {
      approvalUri: suppliedApprovalUri,
      retryable: false,
      status: ActivityPubQuoteStatus.APPROVED,
    };
  }

  if (authorization === null) {
    return {
      approvalUri: authorizationId?.href ?? null,
      retryable: authorizationId !== null,
      status: ActivityPubQuoteStatus.PENDING,
    };
  }
  if (!authorization.id || !source.actorUri || !isHttpUri(new URL(source.actorUri))) {
    return {
      approvalUri: authorization.id?.href ?? null,
      retryable: false,
      status: ActivityPubQuoteStatus.INVALID,
    };
  }

  const verification = await quoteInteraction.verifyAuthorization(context as Context<void>, {
    attributedTo: new URL(source.actorUri),
    authorization: authorizationId ?? authorization,
    interactionTarget: new URL(extraction.targetUri),
    interactingObject: note,
  });
  return verification.verified
    ? {
        approvalUri: verification.authorizationId.href,
        retryable: false,
        status: ActivityPubQuoteStatus.APPROVED,
      }
    : verification.failure.category === 'unverifiable'
      ? {
          approvalUri: authorization.id.href,
          retryable: true,
          status: ActivityPubQuoteStatus.PENDING,
        }
      : {
          approvalUri: authorization.id.href,
          retryable: false,
          status: ActivityPubQuoteStatus.INVALID,
        };
};

const persistQuoteResolution = async (
  resolution: QuoteResolution,
  postId: string,
  expectedRevision?: number,
  authorizationUpdate = false,
): Promise<{ applied: boolean; row: typeof ActivityPubPostQuotes.$inferSelect }> => {
  for (;;) {
    const result = await db.transaction(async (tx) => {
      const current = await tx
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, postId))
        .limit(1)
        .then(first);

      // Embedded Updates can only change authorization on the existing Quote identity.
      if (
        authorizationUpdate &&
        (!current ||
          current.targetUri !== resolution.targetUri ||
          current.format !== resolution.format)
      ) {
        return current ? { applied: false, row: current } : null;
      }

      if (
        expectedRevision !== undefined &&
        (!current ||
          current.resolutionRevision !== expectedRevision ||
          current.status !== ActivityPubQuoteStatus.PENDING)
      ) {
        return current ? { applied: false, row: current } : null;
      }

      if (
        current &&
        current.targetUri === resolution.targetUri &&
        current.format === resolution.format &&
        current.status === resolution.status &&
        current.approvalUri === resolution.approvalUri
      ) {
        return { applied: true, row: current };
      }

      if (
        current?.status === ActivityPubQuoteStatus.REVOKED &&
        resolution.status === ActivityPubQuoteStatus.APPROVED &&
        current.targetUri === resolution.targetUri &&
        current.approvalUri === resolution.approvalUri
      ) {
        return { applied: false, row: current };
      }

      const nextRevision = expectedRevision ?? (current?.resolutionRevision ?? 0) + 1;
      const next = current
        ? await tx
            .update(ActivityPubPostQuotes)
            .set({
              approvalUri: resolution.approvalUri,
              format: resolution.format,
              resolutionRevision: nextRevision,
              status: resolution.status,
              targetUri: resolution.targetUri,
              updatedAt: Temporal.Now.instant(),
            })
            .where(
              expectedRevision === undefined
                ? and(
                    eq(ActivityPubPostQuotes.postId, postId),
                    eq(ActivityPubPostQuotes.resolutionRevision, current.resolutionRevision),
                  )
                : and(
                    eq(ActivityPubPostQuotes.postId, postId),
                    eq(ActivityPubPostQuotes.resolutionRevision, expectedRevision),
                    eq(ActivityPubPostQuotes.status, ActivityPubQuoteStatus.PENDING),
                  ),
            )
            .returning()
            .then(first)
        : await tx
            .insert(ActivityPubPostQuotes)
            .values({
              approvalUri: resolution.approvalUri,
              format: resolution.format,
              postId,
              resolutionRevision: nextRevision,
              status: resolution.status,
              targetUri: resolution.targetUri,
            })
            .onConflictDoNothing()
            .returning()
            .then(first);

      if (next) {
        if (resolution.sourcePostId === postId) {
          throw new Error('Quote Source cannot reference the Quote Post itself');
        }
        if (resolution.sourcePostId !== null) {
          await tx
            .update(Posts)
            .set({ repostSourceId: resolution.sourcePostId })
            .where(eq(Posts.id, postId));
        }
        return { applied: true, row: next };
      }

      const raced = await tx
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, postId))
        .limit(1)
        .then(first);
      if (!raced) {
        throw new Error('Quote resolution row disappeared after concurrent insert');
      }
      return { applied: false, raced: true as const, row: raced };
    });
    if (!result) {
      throw new Error('Quote resolution row disappeared');
    }
    if ('raced' in result && expectedRevision === undefined) {
      continue;
    }
    return { applied: result.applied, row: result.row };
  }
};

const startQuoteResolutionWorkflow = async (postId: string, revision: number): Promise<void> => {
  await temporalClient.withDeadline(Date.now() + 5_000, () =>
    temporalClient.workflow.start('activitypubQuoteResolutionWorkflow', {
      args: [{ postId, revision }],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId: `activitypub-quote-resolution:${postId}:${revision}`,
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    }),
  );
};

export const handleInboundQuote = async ({
  actorUri,
  context,
  note,
  postId,
  receivedAt,
  startWorkflow = true,
  expectedRevision,
  authorizationUpdate = false,
}: InboundQuoteInput): Promise<InboundQuoteResolution> => {
  let extraction = await extractQuote(context, note);
  if (!extraction) {
    return { retryable: false, status: null };
  }

  const current = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, postId))
    .limit(1)
    .then(first);
  if (
    authorizationUpdate &&
    (!current ||
      extraction.malformed ||
      current.targetUri !== extraction.targetUri ||
      current.format !== extraction.format)
  ) {
    return { retryable: false, status: current?.status ?? null };
  }

  if (
    current &&
    current.targetUri === extraction.targetUri &&
    current.format === extraction.format &&
    current.approvalUri === (extraction.authorizationId?.href ?? null) &&
    (current.status === ActivityPubQuoteStatus.INVALID ||
      (!extraction.malformed &&
        (current.status === ActivityPubQuoteStatus.APPROVED ||
          current.status === ActivityPubQuoteStatus.REVOKED)))
  ) {
    return { retryable: false, status: current.status };
  }

  extraction = await hydrateFepReferences(context, note, extraction);

  let targetResolution: QuoteTargetResolution = { kind: 'permanent_failure' };
  if (!extraction.malformed) {
    const existingSourcePostId = await findPostByActivityPubUri(
      context,
      new URL(extraction.targetUri),
    );
    targetResolution = existingSourcePostId
      ? { kind: 'found', postId: existingSourcePostId }
      : await materializeTarget({
          context,
          expectedRevision,
          extraction,
          postId,
          receivedAt,
        });
  }

  if (targetResolution.kind === 'stale') {
    const current = await db
      .select({ status: ActivityPubPostQuotes.status })
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, postId))
      .limit(1)
      .then(first);
    return { retryable: false, status: current?.status ?? null };
  }
  const sourcePostId = targetResolution.kind === 'found' ? targetResolution.postId : undefined;
  const source = sourcePostId ? await loadQuoteSource(sourcePostId) : null;
  let resolution: QuoteResolution;
  if (extraction.malformed) {
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: ActivityPubQuoteStatus.INVALID,
      targetUri: extraction.targetUri,
      retryable: false,
    };
  } else if (sourcePostId === postId) {
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: ActivityPubQuoteStatus.INVALID,
      targetUri: extraction.targetUri,
      retryable: false,
    };
  } else if (!source || source.currentContentId === null || source.postState !== PostState.ACTIVE) {
    const transient = targetResolution.kind === 'transient_failure';
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: transient ? ActivityPubQuoteStatus.PENDING : ActivityPubQuoteStatus.INVALID,
      targetUri: extraction.targetUri,
      retryable: transient,
    };
  } else {
    const authorization = await classifyAuthorization({
      actorUri,
      authorization: extraction.authorization,
      authorizationId: extraction.authorizationId,
      context,
      extraction,
      note,
      source,
    });
    resolution = {
      approvalUri: authorization.approvalUri,
      format: extraction.format,
      sourcePostId: source.postId,
      status: authorization.status,
      targetUri: extraction.targetUri,
      retryable: authorization.retryable,
    };
  }

  const stored = await persistQuoteResolution(
    resolution,
    postId,
    expectedRevision,
    authorizationUpdate,
  );
  if (!stored.applied) {
    return { retryable: false, status: stored.row.status };
  }
  if (
    startWorkflow &&
    stored.row.status === ActivityPubQuoteStatus.PENDING &&
    resolution.retryable
  ) {
    await startQuoteResolutionWorkflow(postId, stored.row.resolutionRevision);
  }
  return { retryable: resolution.retryable, status: stored.row.status };
};

export const resolveStoredInboundQuote = async ({
  context,
  postId,
  receivedAt,
  revision,
}: {
  context: QuoteContext;
  postId: string;
  receivedAt: Temporal.Instant;
  revision: number;
}): Promise<InboundQuoteResolution> => {
  const row = await db
    .select({
      actorUri: ActivityPubActors.uri,
      approvalUri: ActivityPubPostQuotes.approvalUri,
      format: ActivityPubPostQuotes.format,
      postUri: ActivityPubPosts.uri,
      resolutionRevision: ActivityPubPostQuotes.resolutionRevision,
      status: ActivityPubPostQuotes.status,
      targetUri: ActivityPubPostQuotes.targetUri,
    })
    .from(ActivityPubPostQuotes)
    .innerJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, ActivityPubPostQuotes.postId))
    .innerJoin(Posts, eq(Posts.id, ActivityPubPostQuotes.postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(ActivityPubPostQuotes.postId, postId))
    .limit(1)
    .then(first);

  if (
    !row ||
    row.resolutionRevision !== revision ||
    row.status !== ActivityPubQuoteStatus.PENDING ||
    row.actorUri === null
  ) {
    return { retryable: false, status: row?.status ?? null };
  }

  const note = new Note({
    attribution: new URL(row.actorUri),
    id: new URL(row.postUri),
    ...(row.format === ActivityPubQuoteFormat.FEP_044F
      ? {
          quote: new URL(row.targetUri),
          ...(row.approvalUri ? { quoteAuthorization: new URL(row.approvalUri) } : {}),
        }
      : { quoteUrl: new URL(row.targetUri) }),
  });
  return handleInboundQuote({
    actorUri: row.actorUri,
    context,
    note,
    postId,
    receivedAt,
    startWorkflow: false,
    expectedRevision: revision,
  });
};

export const revokeInboundQuote = async ({
  actorUri,
  authorizationUri,
}: {
  actorUri: string;
  authorizationUri: string;
}): Promise<boolean> => {
  const target = await db
    .select({
      postId: ActivityPubPostQuotes.postId,
      sourceActorUri: QuoteTargetActors.uri,
    })
    .from(ActivityPubPostQuotes)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPostQuotes.postId))
    .innerJoin(
      QuoteTargetActivityPubPosts,
      eq(QuoteTargetActivityPubPosts.uri, ActivityPubPostQuotes.targetUri),
    )
    .innerJoin(QuoteTargetPosts, eq(QuoteTargetPosts.id, QuoteTargetActivityPubPosts.postId))
    .innerJoin(QuoteTargetProfiles, eq(QuoteTargetProfiles.id, QuoteTargetPosts.profileId))
    .innerJoin(QuoteTargetActors, eq(QuoteTargetActors.profileId, QuoteTargetProfiles.id))
    .where(eq(ActivityPubPostQuotes.approvalUri, authorizationUri))
    .limit(1)
    .then(first);

  if (!target || target.sourceActorUri !== actorUri) {
    return false;
  }

  await db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, target.postId))
      .limit(1)
      .then(first);
    if (!current || current.status === ActivityPubQuoteStatus.REVOKED) {
      return;
    }
    const revoked = await tx
      .update(ActivityPubPostQuotes)
      .set({
        resolutionRevision: current.resolutionRevision + 1,
        status: ActivityPubQuoteStatus.REVOKED,
        updatedAt: Temporal.Now.instant(),
      })
      .where(
        and(
          eq(ActivityPubPostQuotes.postId, target.postId),
          eq(ActivityPubPostQuotes.resolutionRevision, current.resolutionRevision),
          eq(ActivityPubPostQuotes.approvalUri, authorizationUri),
        ),
      )
      .returning({ postId: ActivityPubPostQuotes.postId })
      .then(first);
    if (!revoked) {
      return;
    }
  });
  return true;
};
