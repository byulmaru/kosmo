import '@kosmo/core/polyfill';

import { quoteInteraction } from '@fedify/interaction-controls';
import { Note } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, PostQuoteConsentStatus, PostState } from '@kosmo/core/enums';
import { applyPostQuoteConsent } from '@kosmo/core/services';
import { temporalClient } from '@kosmo/core/temporal/client';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri } from './activitypub-uri';
import { materializeHydratedRemoteNote } from './inbound-create-note';
import { RemoteActorDiscoveryUnavailableError } from './remote-actor-materialization';
import type { Context } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type { Transaction } from '@kosmo/core/db';
import type { ApplyPostQuoteConsentInput } from '@kosmo/core/services';
import type { InboundObservation } from './inbound-observability';

const ActivityPubQuoteFormat = { FEP_044F: 'FEP_044F', LEGACY: 'LEGACY' } as const;
type ActivityPubQuoteFormat = (typeof ActivityPubQuoteFormat)[keyof typeof ActivityPubQuoteFormat];

export type QuoteExpectation = {
  readonly expectedStatus: PostQuoteConsentStatus | null;
  readonly expectedApprovalUri: string | null;
  readonly expectedRepostSourceId: string | null;
};

export type InboundQuoteRetryInput = QuoteExpectation & {
  readonly postId: string;
  readonly targetUri: string;
  readonly format: ActivityPubQuoteFormat;
  readonly approvalUri: string | null;
};

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
  expectation?: QuoteExpectation;
  authorizationUpdate?: boolean;
};

export type InboundQuoteResolution = {
  retryable: boolean;
  status: PostQuoteConsentStatus | null;
  retryInput?: InboundQuoteRetryInput;
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
  uri: string;
};

type QuoteResolution = {
  approvalUri: string | null;
  format: ActivityPubQuoteFormat;
  sourcePostId: string | null;
  status: PostQuoteConsentStatus;
  targetUri: string;
  retryable: boolean;
  proof?: Extract<
    ApplyPostQuoteConsentInput,
    { operation: 'RESOLVE'; result: 'APPROVED' }
  >['proof'];
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
      uri: ActivityPubPosts.uri,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
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
      uri: new URL(`/ap/note/${row.postId}`, row.canonicalOrigin).href,
    };
  }

  return row.uri ? { ...row, uri: row.uri } : null;
};

const materializeTarget = async ({
  context,
  expectation,
  extraction,
  postId,
  receivedAt,
}: {
  context: QuoteContext;
  expectation?: QuoteExpectation;
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

  if (expectation && !(await matchesQuoteExpectation(postId, expectation))) {
    return { kind: 'stale' };
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
}): Promise<Pick<QuoteResolution, 'approvalUri' | 'retryable' | 'status' | 'proof'>> => {
  const suppliedApprovalUri = authorizationId?.href ?? authorization?.id?.href ?? null;
  if (source.actorUri === actorUri) {
    return {
      approvalUri: suppliedApprovalUri,
      retryable: false,
      status: PostQuoteConsentStatus.APPROVED,
      proof: { kind: 'SELF' },
    };
  }

  if (!extraction.fepPropertyPresent) {
    return {
      approvalUri: suppliedApprovalUri,
      retryable: false,
      status: PostQuoteConsentStatus.APPROVED,
      proof: { kind: 'LEGACY_QUOTE_URL' },
    };
  }

  if (authorization === null) {
    return {
      approvalUri: authorizationId?.href ?? null,
      retryable: authorizationId !== null,
      status: PostQuoteConsentStatus.PENDING,
    };
  }
  if (!authorization.id || !source.actorUri || !isHttpUri(new URL(source.actorUri))) {
    return {
      approvalUri: authorization.id?.href ?? null,
      retryable: false,
      status: PostQuoteConsentStatus.PENDING,
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
        proof: {
          kind: 'AUTHORIZATION',
          approvalUri: verification.authorizationId.href,
          issuerActorUri: source.actorUri,
        },
        approvalUri: verification.authorizationId.href,
        retryable: false,
        status: PostQuoteConsentStatus.APPROVED,
      }
    : verification.failure.category === 'unverifiable'
      ? {
          approvalUri: authorization.id.href,
          retryable: true,
          status: PostQuoteConsentStatus.PENDING,
        }
      : {
          approvalUri: authorization.id.href,
          retryable: false,
          status: PostQuoteConsentStatus.PENDING,
        };
};

const loadQuoteExpectation = async (postId: string, tx: typeof db | Transaction = db) =>
  tx
    .select({
      expectedStatus: Posts.quoteConsentStatus,
      expectedApprovalUri: Posts.quoteConsentApprovalUri,
      expectedRepostSourceId: Posts.repostSourceId,
    })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

const expectationCondition = (postId: string, expectation: QuoteExpectation) =>
  and(
    eq(Posts.id, postId),
    eq(Posts.state, PostState.ACTIVE),
    expectation.expectedStatus === null
      ? isNull(Posts.quoteConsentStatus)
      : eq(Posts.quoteConsentStatus, expectation.expectedStatus),
    expectation.expectedApprovalUri === null
      ? isNull(Posts.quoteConsentApprovalUri)
      : eq(Posts.quoteConsentApprovalUri, expectation.expectedApprovalUri),
    expectation.expectedRepostSourceId === null
      ? isNull(Posts.repostSourceId)
      : eq(Posts.repostSourceId, expectation.expectedRepostSourceId),
  );

const matchesQuoteExpectation = async (postId: string, expectation: QuoteExpectation) =>
  (
    await db
      .select({ id: Posts.id })
      .from(Posts)
      .where(expectationCondition(postId, expectation))
      .limit(1)
  ).length > 0;

const persistQuoteResolution = async (
  resolution: QuoteResolution,
  postId: string,
  expectation: QuoteExpectation,
  quote: QuoteSource,
  source: QuoteSource | null,
): Promise<{ applied: boolean; expectation: QuoteExpectation }> => {
  const next = await db.transaction(async (tx) => {
    if (resolution.sourcePostId === null) {
      // There is no Source identity for the shared RESOLVE yet. Only initialize
      // pending consent; never erase a verified rejection/revocation or relation.
      if (
        expectation.expectedRepostSourceId !== null ||
        expectation.expectedStatus === PostQuoteConsentStatus.REVOKED ||
        expectation.expectedStatus === PostQuoteConsentStatus.REJECTED
      ) {
        return false;
      }
      const rows = await tx
        .update(Posts)
        .set({
          quoteConsentStatus: PostQuoteConsentStatus.PENDING,
          quoteConsentApprovalUri: resolution.approvalUri,
        })
        .where(
          and(
            expectationCondition(postId, expectation),
            eq(Posts.profileId, quote.profileId),
            quote.currentContentId === null
              ? isNull(Posts.currentContentId)
              : eq(Posts.currentContentId, quote.currentContentId),
            sql`EXISTS (SELECT 1 FROM activitypub_post ap INNER JOIN activitypub_actor actor ON actor.profile_id = ${quote.profileId} WHERE ap.post_id = ${postId} AND ap.uri = ${quote.uri} AND actor.uri = ${quote.actorUri})`,
          ),
        )
        .returning({ id: Posts.id });
      return rows.length > 0
        ? {
            ...expectation,
            expectedStatus: PostQuoteConsentStatus.PENDING,
            expectedApprovalUri: resolution.approvalUri,
          }
        : null;
    }
    if (!quote?.actorUri || !source?.actorUri) {
      return false;
    }
    const identity = (post: QuoteSource) => ({
      postId: post.postId,
      profileId: post.profileId,
      uri: post.uri,
      authorActorUri: post.actorUri!,
    });
    const input: ApplyPostQuoteConsentInput = {
      ...expectation,
      quote: identity(quote),
      source: identity(source),
      operation: 'RESOLVE',
      quoteAuthorActorUri: quote.actorUri,
      ...(resolution.status === PostQuoteConsentStatus.APPROVED && resolution.proof
        ? { result: 'APPROVED', proof: resolution.proof }
        : { result: 'PENDING', approvalUri: resolution.approvalUri }),
    };
    const result = await applyPostQuoteConsent(input, tx);
    return result
      ? {
          expectedStatus: result.status,
          expectedApprovalUri: result.approvalUri,
          expectedRepostSourceId: result.repostSourceId,
        }
      : null;
  });
  return { applied: !!next, expectation: next || expectation };
};

const startQuoteResolutionWorkflow = async (input: InboundQuoteRetryInput): Promise<void> => {
  await temporalClient.withDeadline(Date.now() + 5_000, () =>
    temporalClient.workflow.signalWithStart('activitypubQuoteResolutionWorkflow', {
      signal: 'resolveQuote',
      signalArgs: [input],
      args: [input],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId: `activitypub-quote-resolution:${input.postId}`,
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
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
  expectation,
  authorizationUpdate = false,
}: InboundQuoteInput): Promise<InboundQuoteResolution> => {
  const quote = await loadQuoteSource(postId);
  if (!quote || quote.uri !== note.id?.href || quote.actorUri !== actorUri) {
    return { retryable: false, status: null };
  }
  let extraction = await extractQuote(context, note);
  if (!extraction) {
    return { retryable: false, status: null };
  }

  const current = await loadQuoteExpectation(postId);
  if (!current) {
    return { retryable: false, status: null };
  }
  expectation ??= current;
  if (!(await matchesQuoteExpectation(postId, expectation))) {
    return { retryable: false, status: current.expectedStatus };
  }
  if (authorizationUpdate) {
    if (current.expectedStatus === null || extraction.malformed) {
      return { retryable: false, status: current.expectedStatus };
    }
    // An authorization Update cannot reinterpret an existing FEP Quote as legacy.
    // Legacy Updates have no consent change to apply.
    if (!extraction.fepPropertyPresent) {
      return { retryable: false, status: current.expectedStatus };
    }
    if (current.expectedRepostSourceId !== null) {
      const source = await loadQuoteSource(current.expectedRepostSourceId);
      if (source?.uri !== extraction.targetUri) {
        return { retryable: false, status: current.expectedStatus };
      }
    } else {
      const original = await temporalClient.workflow
        .getHandle(`activitypub-quote-resolution:${postId}`)
        .query<InboundQuoteRetryInput>('inboundQuoteInput');
      if (original.targetUri !== extraction.targetUri || original.format !== extraction.format) {
        return { retryable: false, status: current.expectedStatus };
      }
    }
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
          expectation,
          extraction,
          postId,
          receivedAt,
        });
  }

  if (targetResolution.kind === 'stale') {
    return {
      retryable: false,
      status: (await loadQuoteExpectation(postId))?.expectedStatus ?? null,
    };
  }
  const sourcePostId = targetResolution.kind === 'found' ? targetResolution.postId : undefined;
  const source = sourcePostId ? await loadQuoteSource(sourcePostId) : null;
  let resolution: QuoteResolution;
  if (extraction.malformed) {
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: PostQuoteConsentStatus.PENDING,
      targetUri: extraction.targetUri,
      retryable: false,
    };
  } else if (sourcePostId === postId) {
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: PostQuoteConsentStatus.PENDING,
      targetUri: extraction.targetUri,
      retryable: false,
    };
  } else if (!source || source.currentContentId === null || source.postState !== PostState.ACTIVE) {
    const transient = targetResolution.kind === 'transient_failure';
    resolution = {
      approvalUri: extraction.authorizationId?.href ?? null,
      format: extraction.format,
      sourcePostId: null,
      status: PostQuoteConsentStatus.PENDING,
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
      proof: authorization.proof,
      approvalUri: authorization.approvalUri,
      format: extraction.format,
      sourcePostId: source.postId,
      status: authorization.status,
      targetUri: extraction.targetUri,
      retryable: authorization.retryable,
    };
  }

  const stored = await persistQuoteResolution(resolution, postId, expectation, quote, source);
  if (!stored.applied) {
    return {
      retryable: false,
      status: (await loadQuoteExpectation(postId))?.expectedStatus ?? null,
    };
  }
  if (
    startWorkflow &&
    stored.expectation.expectedStatus === PostQuoteConsentStatus.PENDING &&
    !extraction.malformed
  ) {
    await startQuoteResolutionWorkflow({
      postId,
      targetUri: extraction.targetUri,
      format: extraction.format,
      approvalUri: resolution.approvalUri,
      ...stored.expectation,
    });
  }
  return {
    retryable: resolution.retryable,
    status: stored.expectation.expectedStatus,
    ...(resolution.retryable
      ? {
          retryInput: {
            postId,
            targetUri: extraction.targetUri,
            format: extraction.format,
            approvalUri: resolution.approvalUri,
            ...stored.expectation,
          },
        }
      : {}),
  };
};

export const resolveStoredInboundQuote = async ({
  context,
  receivedAt,
  ...input
}: InboundQuoteRetryInput & {
  context: QuoteContext;
  receivedAt: Temporal.Instant;
}): Promise<InboundQuoteResolution> => {
  const quote = await loadQuoteSource(input.postId);
  if (!quote?.actorUri || !(await matchesQuoteExpectation(input.postId, input))) {
    return {
      retryable: false,
      status: (await loadQuoteExpectation(input.postId))?.expectedStatus ?? null,
    };
  }
  const note = new Note({
    attribution: new URL(quote.actorUri),
    id: new URL(quote.uri),
    ...(input.format === ActivityPubQuoteFormat.FEP_044F
      ? {
          quote: new URL(input.targetUri),
          ...(input.approvalUri ? { quoteAuthorization: new URL(input.approvalUri) } : {}),
        }
      : { quoteUrl: new URL(input.targetUri) }),
  });
  return handleInboundQuote({
    actorUri: quote.actorUri,
    context,
    note,
    postId: input.postId,
    receivedAt,
    startWorkflow: false,
    expectation: input,
  });
};

export const revokeInboundQuote = async ({
  actorUri,
  authorizationUri,
  context,
}: {
  actorUri: string;
  authorizationUri: string;
  context: QuoteContext;
}): Promise<boolean> => {
  const targets = await db
    .select({ postId: Posts.id })
    .from(Posts)
    .where(eq(Posts.quoteConsentApprovalUri, authorizationUri));
  let handled = false;
  for (const target of targets) {
    const expectation = await loadQuoteExpectation(target.postId);
    if (!expectation?.expectedRepostSourceId) {
      continue;
    }
    const quote = await loadQuoteSource(target.postId);
    const source = await loadQuoteSource(expectation.expectedRepostSourceId);
    if (!quote?.actorUri || !source || source.actorUri !== actorUri) {
      continue;
    }
    handled = true;
    if (expectation.expectedStatus === PostQuoteConsentStatus.REVOKED) {
      continue;
    }
    // A signed Delete alone does not order reused Authorization URIs. Reconcile
    // against the issuer's current object before changing the captured snapshot.
    const verification = await quoteInteraction.verifyAuthorization(context as Context<void>, {
      attributedTo: new URL(actorUri),
      authorization: new URL(authorizationUri),
      interactionTarget: new URL(source.uri),
      interactingObject: new URL(quote.uri),
    });
    if (!verification.verified && verification.failure.category === 'unverifiable') {
      const failure = verification.failure;
      const cause = 'cause' in failure ? failure.cause : undefined;
      const absent =
        failure.type === 'notDereferenceable' &&
        failure.url.href === authorizationUri &&
        cause instanceof Error &&
        'response' in cause &&
        cause.response instanceof Response &&
        (cause.response.status === 404 || cause.response.status === 410);
      if (!absent) {
        throw new Error(
          'Current Quote Authorization could not be verified; retry revocation reconciliation',
        );
      }
    }
    const identity = (post: QuoteSource) => ({
      postId: post.postId,
      profileId: post.profileId,
      uri: post.uri,
      authorActorUri: post.actorUri!,
    });
    await applyPostQuoteConsent({
      ...expectation,
      quote: identity(quote),
      source: identity(source),
      ...(verification.verified
        ? {
            operation: 'RESOLVE',
            result: 'APPROVED',
            quoteAuthorActorUri: quote.actorUri,
            proof: {
              kind: 'AUTHORIZATION',
              approvalUri: verification.authorizationId.href,
              issuerActorUri: actorUri,
            },
          }
        : { operation: 'REVOKE', approvalUri: authorizationUri, issuerActorUri: actorUri }),
    });
  }
  return handled;
};
