import '@kosmo/core/polyfill';

import { randomUUID } from 'node:crypto';
import { getDocumentLoader } from '@fedify/fedify/runtime';
import { quoteInteraction } from '@fedify/interaction-controls';
import { Note, QuoteAuthorization } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, PostQuoteConsentStatus, PostState } from '@kosmo/core/enums';
import {
  loadPendingQuoteConsentByBinding,
  loadQuoteConsentByApprovalUri,
  loadQuoteConsentByRequestUri,
} from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { postQuoteOwnerWorkflow } from '@kosmo/core/temporal/post-quote-owner';
import { and, eq, isNull } from 'drizzle-orm';
import { findPostByActivityPubUri, resolveActivityPubPostUri } from './activitypub-post-uri';
import { isHttpUri } from './activitypub-uri';
import { materializeHydratedRemoteNote } from './inbound-create-note';
import { RemoteActorDiscoveryUnavailableError } from './remote-actor-materialization';
import type { Context } from '@fedify/fedify';
import type { DocumentLoader } from '@fedify/fedify/runtime';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type { Transaction } from '@kosmo/core/db';
import type { ApplyPostQuoteConsentInput } from '@kosmo/core/services';
import type {
  PreparedQuoteConsent,
  QuoteOwnerCommand,
} from '@kosmo/core/temporal/post-quote-owner';
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
  | 'canonicalOrigin'
  | 'contextLoader'
  | 'documentLoader'
  | 'lookupObject'
  | 'parseUri'
  | 'getActorKeyPairs'
  | 'getDocumentLoader'
> & { recipient?: string | null; quoteAuthorizationDocumentLoader?: DocumentLoader };

const currentAuthorizationLoader = async (context: QuoteContext): Promise<DocumentLoader> => {
  if (context.quoteAuthorizationDocumentLoader) {
    return context.quoteAuthorizationDocumentLoader;
  }
  if (context.recipient) {
    const keys = await context.getActorKeyPairs(context.recipient);
    const key = keys.find((candidate) => candidate.privateKey !== null);
    if (key?.privateKey) {
      return context.getDocumentLoader({ keyId: key.keyId, privateKey: key.privateKey });
    }
  }
  // Federation's ordinary documentLoader uses kvCache. Authorization URIs can
  // be reused, so the issuer must be queried again for each consent decision.
  return getDocumentLoader({ allowPrivateAddress: false });
};

type InboundQuoteInput = {
  commandId?: string;
  actorUri: string;
  authorProfileId?: string;
  context: QuoteContext;
  note: Note;
  postId: string;
  receivedAt: Temporal.Instant;
  startWorkflow?: boolean;
  expectation?: QuoteExpectation;
  authorizationUpdate?: boolean;
  duplicateCreate?: boolean;
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
    targetObject:
      !malformed && fepPropertyPresent
        ? await note
            .getQuote({
              contextLoader: context.contextLoader,
              documentLoader: async () => {
                throw new Error('Only embedded Quote Source is extracted at admission');
              },
              suppressError: true,
              crossOrigin: 'trust',
            })
            .catch(() => null)
        : null,
    targetUri,
  };
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

  const uri = await resolveActivityPubPostUri(postId);
  if (!uri) {
    return null;
  }

  return {
    ...row,
    actorUri:
      row.actorUri ??
      (row.instanceKind === InstanceKind.LOCAL && row.canonicalOrigin
        ? new URL(`/ap/actor/${row.profileId}`, row.canonicalOrigin).href
        : null),
    uri: uri.href,
  };
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
        canonicalOrigin: context.canonicalOrigin,
        parseUri: (uri) => context.parseUri(uri),
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

  const candidate = authorizationId ?? authorization?.id ?? null;
  if (candidate === null) {
    return {
      approvalUri: authorizationId?.href ?? null,
      retryable: false,
      status: PostQuoteConsentStatus.PENDING,
    };
  }
  if (!source.actorUri || !isHttpUri(new URL(source.actorUri))) {
    return {
      approvalUri: candidate.href,
      retryable: false,
      status: PostQuoteConsentStatus.PENDING,
    };
  }

  const verification = await quoteInteraction.verifyAuthorization(context as Context<void>, {
    attributedTo: new URL(source.actorUri),
    authorization: candidate,
    documentLoader: await currentAuthorizationLoader(context),
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
          approvalUri: candidate.href,
          retryable: true,
          status: PostQuoteConsentStatus.PENDING,
        }
      : {
          approvalUri: candidate.href,
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

export type PreparedInboundQuote = PreparedQuoteConsent;

const identity = (post: QuoteSource) => ({
  postId: post.postId,
  profileId: post.profileId,
  uri: post.uri,
  authorActorUri: post.actorUri!,
});

type NoteCommand = Extract<QuoteOwnerCommand, { kind: 'NOTE' }>;

/** Source materialization is a write boundary, intentionally separate from proof reads. */
export const materializeInboundQuoteSource = async (input: NoteCommand, context: QuoteContext) => {
  if (
    input.malformed ||
    !input.targetUri ||
    (await findPostByActivityPubUri(context, new URL(input.targetUri)))
  ) {
    return;
  }
  await materializeTarget({
    context,
    postId: input.postId,
    receivedAt: Temporal.Now.instant(),
    extraction: {
      format: input.format,
      targetUri: input.targetUri,
      authorizationId: input.approvalUri ? new URL(input.approvalUri) : null,
      authorization: null,
      targetObject: input.embeddedSource
        ? await Note.fromJsonLd(input.embeddedSource, {
            contextLoader: context.contextLoader ?? getDocumentLoader(),
          })
        : null,
      fepPropertyPresent: input.format === ActivityPubQuoteFormat.FEP_044F,
      malformed: false,
    },
  });
};

/** Reads identities and fresh protocol proof; never changes Posts or consent. */
export const prepareStoredInboundQuote = async (
  input: NoteCommand,
  context: QuoteContext,
  phase: 'INVALIDATE' | 'VERIFY' = 'VERIFY',
): Promise<PreparedInboundQuote> => {
  const quote = await loadQuoteSource(input.postId);
  const expectation = await loadQuoteExpectation(input.postId);
  if (
    !quote?.actorUri ||
    quote.actorUri !== input.actorUri ||
    (input.authorProfileId !== undefined && quote.profileId !== input.authorProfileId) ||
    !expectation
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  if (input.malformed) {
    if (expectation.expectedStatus !== null || expectation.expectedRepostSourceId !== null) {
      return { kind: 'NOOP', retryable: false };
    }
    return {
      kind: 'PENDING_WITHOUT_SOURCE',
      retryable: false,
      pending: {
        postId: input.postId,
        profileId: quote.profileId,
        quoteUri: quote.uri,
        actorUri: quote.actorUri,
        currentContentId: quote.currentContentId,
        expectedStatus: null,
        expectedApprovalUri: expectation.expectedApprovalUri,
        approvalUri: null,
      },
    };
  }
  if (
    expectation.expectedStatus === PostQuoteConsentStatus.APPROVED &&
    input.approvalUri === null
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  const sourceId = input.targetUri
    ? await findPostByActivityPubUri(context, new URL(input.targetUri))
    : null;
  const source = sourceId ? await loadQuoteSource(sourceId) : null;
  if (
    expectation.expectedRepostSourceId &&
    (sourceId !== expectation.expectedRepostSourceId || source?.uri !== input.targetUri)
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  if (
    !source?.actorUri ||
    source.postId === quote.postId ||
    source.postState !== PostState.ACTIVE ||
    source.currentContentId === null
  ) {
    if (
      expectation.expectedRepostSourceId !== null ||
      expectation.expectedStatus === PostQuoteConsentStatus.REVOKED ||
      expectation.expectedStatus === PostQuoteConsentStatus.REJECTED
    ) {
      return { kind: 'NOOP', retryable: false };
    }
    return {
      kind: 'PENDING_WITHOUT_SOURCE',
      pending: {
        postId: input.postId,
        profileId: quote.profileId,
        quoteUri: quote.uri,
        actorUri: quote.actorUri,
        currentContentId: quote.currentContentId,
        expectedStatus: expectation.expectedStatus,
        expectedApprovalUri: expectation.expectedApprovalUri,
        approvalUri: input.approvalUri,
      },
      retryable: !!input.targetUri,
    };
  }
  if (input.authorizationUpdate && input.format === ActivityPubQuoteFormat.LEGACY) {
    return { kind: 'NOOP', retryable: false };
  }
  if (phase === 'INVALIDATE') {
    if (
      !input.authorizationUpdate ||
      source.actorUri === input.actorUri ||
      (expectation.expectedStatus !== PostQuoteConsentStatus.APPROVED &&
        expectation.expectedStatus !== PostQuoteConsentStatus.PENDING)
    ) {
      return { kind: 'NOOP', retryable: false };
    }
    return {
      kind: 'CHANGE',
      retryable: false,
      change: {
        ...expectation,
        quote: identity(quote),
        source: identity(source),
        operation: 'RESOLVE',
        quoteAuthorActorUri: input.actorUri,
        result: 'PENDING',
        approvalUri: input.approvalUri,
      },
    };
  }
  const note = new Note({
    id: new URL(quote.uri),
    attribution: new URL(input.actorUri),
    ...(input.format === ActivityPubQuoteFormat.FEP_044F
      ? {
          quote: new URL(input.targetUri),
          ...(input.approvalUri ? { quoteAuthorization: new URL(input.approvalUri) } : {}),
        }
      : { quoteUrl: new URL(input.targetUri) }),
  });
  const authorization = await classifyAuthorization({
    actorUri: input.actorUri,
    authorization: null,
    authorizationId: input.approvalUri ? new URL(input.approvalUri) : null,
    context,
    extraction: {
      format: input.format,
      targetUri: input.targetUri,
      authorization: null,
      authorizationId: null,
      targetObject: null,
      fepPropertyPresent: input.format === ActivityPubQuoteFormat.FEP_044F,
      malformed: false,
    },
    note,
    source,
  });
  if (
    expectation.expectedStatus === PostQuoteConsentStatus.APPROVED &&
    !input.authorizationUpdate &&
    authorization.status !== PostQuoteConsentStatus.APPROVED
  ) {
    return { kind: 'NOOP', retryable: true };
  }
  return {
    kind: 'CHANGE',
    retryable: authorization.retryable,
    change: {
      ...expectation,
      quote: identity(quote),
      source: identity(source),
      operation: 'RESOLVE',
      quoteAuthorActorUri: input.actorUri,
      ...(authorization.status === PostQuoteConsentStatus.APPROVED && authorization.proof
        ? { result: 'APPROVED', proof: authorization.proof }
        : { result: 'PENDING', approvalUri: authorization.approvalUri }),
    },
  };
};

const admit = async (command: QuoteOwnerCommand) =>
  runWorkflow(postQuoteOwnerWorkflow, {
    args: [{ postId: command.postId }],
    mode: 'update-with-start',
    updateArgs: [command],
    updateId: command.commandId,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'ALLOW_DUPLICATE',
  });

export const handleInboundQuote = async ({
  commandId = randomUUID(),
  actorUri,
  authorProfileId,
  context,
  note,
  postId,
  authorizationUpdate = false,
  duplicateCreate = false,
}: InboundQuoteInput): Promise<InboundQuoteResolution> => {
  const extraction = await extractQuote(context, note);
  if (!extraction) {
    return { retryable: false, status: null };
  }
  const embedded = extraction.targetObject
    ? await extraction.targetObject.toJsonLd({
        format: 'expand',
        contextLoader: context.contextLoader ?? getDocumentLoader(),
      })
    : null;
  const result = await admit({
    kind: 'NOTE',
    postId,
    commandId,
    actorUri,
    ...(authorProfileId === undefined ? {} : { authorProfileId }),
    targetUri: extraction.malformed ? '' : extraction.targetUri,
    ...(extraction.malformed ? { malformed: true } : {}),
    ...(embedded
      ? {
          embeddedSource: (Array.isArray(embedded) ? embedded[0] : embedded) as Record<
            string,
            unknown
          >,
        }
      : {}),
    format: extraction.format,
    approvalUri: extraction.authorizationId?.href ?? null,
    authorizationUpdate,
    duplicateCreate,
  });
  return { retryable: result.retryable, status: result.status };
};

/** Compatibility admission for the old resolution Workflow; it cannot write consent. */
export const resolveStoredInboundQuote = async (
  input: InboundQuoteRetryInput & {
    context: QuoteContext;
    receivedAt: Temporal.Instant;
  },
): Promise<InboundQuoteResolution> => {
  const quote = await loadQuoteSource(input.postId);
  if (!quote?.actorUri) {
    return { retryable: false, status: null };
  }
  await admit({
    kind: 'NOTE',
    postId: input.postId,
    commandId: randomUUID(),
    actorUri: quote.actorUri,
    targetUri: input.targetUri,
    format: input.format,
    approvalUri: input.approvalUri,
    authorizationUpdate: false,
    duplicateCreate: false,
  });
  return {
    retryable: false,
    status: (await loadQuoteExpectation(input.postId))?.expectedStatus ?? null,
  };
};

export const prepareInboundQuoteDelete = async (
  input: Extract<QuoteOwnerCommand, { kind: 'DELETE' }>,
  context: QuoteContext,
  ambiguous: boolean,
): Promise<PreparedInboundQuote> => {
  const expectation = await loadQuoteExpectation(input.postId);
  if (
    !expectation?.expectedRepostSourceId ||
    (expectation.expectedApprovalUri !== null &&
      expectation.expectedApprovalUri !== input.approvalUri) ||
    expectation.expectedStatus === PostQuoteConsentStatus.REVOKED
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  const quote = await loadQuoteSource(input.postId);
  const source = await loadQuoteSource(expectation.expectedRepostSourceId);
  if (
    !quote?.actorUri ||
    !source ||
    source.actorUri !== input.actorUri ||
    (input.targetUri !== null && input.targetUri !== source.uri)
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  if (ambiguous) {
    const verification = await quoteInteraction.verifyAuthorization(context as Context<void>, {
      attributedTo: new URL(input.actorUri),
      authorization: new URL(input.approvalUri),
      documentLoader: await currentAuthorizationLoader(context),
      interactionTarget: new URL(source.uri),
      interactingObject: new URL(quote.uri),
    });
    // Unavailable, absent, malformed, and invalid objects do not prove deletion.
    // Bare 410 remains unresolved; only explicit signed Delete is authoritative.
    return { kind: 'NOOP', retryable: !verification.verified };
  }
  return {
    kind: 'CHANGE',
    retryable: false,
    change: {
      ...expectation,
      quote: identity(quote),
      source: identity(source),
      operation: 'REVOKE',
      approvalUri: input.approvalUri,
      issuerActorUri: input.actorUri,
    },
  };
};

export const revokeInboundQuote = async ({
  actorUri,
  authorizationUri,
  activityId = null,
  targetUri = null,
  embedded = null,
}: {
  actorUri: string;
  authorizationUri: string;
  context: QuoteContext;
  activityId?: string | null;
  targetUri?: string | null;
  embedded?: ActivityPubObject | null;
}): Promise<boolean> => {
  const targets = await db
    .select({ postId: Posts.id })
    .from(Posts)
    .where(eq(Posts.quoteConsentApprovalUri, authorizationUri));
  const localConsent = await loadQuoteConsentByApprovalUri(db, authorizationUri);
  if (localConsent && !targets.some((target) => target.postId === localConsent.id)) {
    targets.push({ postId: localConsent.id });
  }
  if (targets.length === 0) {
    const sourceUri =
      targetUri ??
      (embedded instanceof QuoteAuthorization ? embedded.interactionTargetId?.href : undefined);
    if (sourceUri) {
      const pending = await loadPendingQuoteConsentByBinding(db, {
        sourceUri,
        sourceAuthorActorUri: actorUri,
        quoteUri:
          embedded instanceof QuoteAuthorization ? embedded.interactingObjectId?.href : undefined,
      });
      if (pending) {
        targets.push({ postId: pending.id });
      }
    }
  }
  let handled = false;
  for (const target of targets) {
    const expectation = await loadQuoteExpectation(target.postId);
    const source = expectation?.expectedRepostSourceId
      ? await loadQuoteSource(expectation.expectedRepostSourceId)
      : null;
    const quote = await loadQuoteSource(target.postId);
    if (
      source?.actorUri !== actorUri ||
      !quote ||
      new URL(authorizationUri).origin !== new URL(actorUri).origin ||
      (targetUri !== null && targetUri !== source.uri)
    ) {
      continue;
    }
    if (
      embedded !== null &&
      (!(embedded instanceof QuoteAuthorization) ||
        embedded.id?.href !== authorizationUri ||
        embedded.attributionIds.length !== 1 ||
        embedded.attributionIds[0]?.href !== actorUri ||
        embedded.interactingObjectId?.href !== quote.uri ||
        embedded.interactionTargetId?.href !== source.uri)
    ) {
      continue;
    }
    handled = true;
    await admit({
      kind: 'DELETE',
      postId: target.postId,
      commandId: activityId ?? randomUUID(),
      actorUri,
      approvalUri: authorizationUri,
      activityId,
      targetUri,
    });
  }
  return handled;
};

export const prepareInboundQuoteResponse = async (
  input: Extract<QuoteOwnerCommand, { kind: 'ACCEPT' | 'REJECT' }>,
  context: QuoteContext,
): Promise<PreparedQuoteConsent> => {
  const consent = await loadQuoteConsentByRequestUri(db, input.requestUri);
  if (
    !consent ||
    consent.id !== input.postId ||
    consent.sourceAuthorActorUri !== input.sourceAuthorActorUri ||
    consent.status !== PostQuoteConsentStatus.PENDING
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  const expectation = await loadQuoteExpectation(input.postId);
  const quote = await loadQuoteSource(input.postId);
  const source = expectation?.expectedRepostSourceId
    ? await loadQuoteSource(expectation.expectedRepostSourceId)
    : null;
  if (!expectation || !quote?.actorUri || !source?.actorUri) {
    return { kind: 'NOOP', retryable: false };
  }
  if (input.kind === 'REJECT') {
    return {
      kind: 'CHANGE',
      retryable: false,
      change: {
        ...expectation,
        quote: identity(quote),
        source: identity(source),
        operation: 'REJECT',
        issuerActorUri: input.sourceAuthorActorUri,
      },
    };
  }
  if (
    input.quoteUri !== quote.uri ||
    input.sourceUri !== source.uri ||
    (expectation.expectedApprovalUri !== null &&
      expectation.expectedApprovalUri !== null &&
      expectation.expectedApprovalUri !== input.approvalUri)
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  const verification = await quoteInteraction.verifyAuthorization(context as Context<void>, {
    attributedTo: new URL(source.actorUri),
    authorization: new URL(input.approvalUri),
    documentLoader: await currentAuthorizationLoader(context),
    interactionTarget: new URL(source.uri),
    interactingObject: new URL(quote.uri),
  });
  if (!verification.verified) {
    return { kind: 'NOOP', retryable: true };
  }
  return {
    kind: 'CHANGE',
    retryable: false,
    change: {
      ...expectation,
      quote: identity(quote),
      source: identity(source),
      operation: 'RESOLVE',
      quoteAuthorActorUri: quote.actorUri,
      result: 'APPROVED',
      proof: {
        kind: 'AUTHORIZATION',
        approvalUri: verification.authorizationId.href,
        issuerActorUri: source.actorUri,
      },
    },
  };
};
