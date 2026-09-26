import '@kosmo/core/polyfill';

import { Accept, Note, QuoteAuthorization, Reject } from '@fedify/vocab';
import {
  db as coreDb,
  first,
  Instances,
  PostQuoteRevocations,
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
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import {
  applyInboundQuoteAccept,
  applyInboundQuoteReject,
  applyInboundQuoteRevocation,
  completePostQuoteEffectReceipt,
  loadPendingQuoteConsentByBinding,
  loadQuoteConsentByApprovalUri,
  loadQuoteConsentByRequestUri,
  loadQuotePostIdentity,
  loadQuoteSourceIdentity,
  recordInboundQuoteRequest,
} from '@kosmo/core/services';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Delete, QuoteRequest } from '@fedify/vocab';
import type { PostQuoteConsentRow } from '@kosmo/core/services';

const noNetworkDocumentLoader = async (url: string): Promise<never> => {
  throw new Error(`Network lookup is disabled for inbound QuoteAuthorization: ${url}`);
};

const isUsableHttpUri = (value: URL | null | undefined): value is URL =>
  value !== null && value !== undefined && isHttpUri(value);

const remoteRecipient = (actor: {
  readonly inboxUri: string | null;
  readonly sharedInboxUri: string | null;
  readonly uri: string;
}) => {
  if (!actor.inboxUri) {
    return null;
  }

  try {
    const id = new URL(actor.uri);
    const inboxId = new URL(actor.inboxUri);
    if (!isHttpUri(id) || !isHttpUri(inboxId)) {
      return null;
    }
    const sharedInbox = actor.sharedInboxUri ? new URL(actor.sharedInboxUri) : null;
    return {
      endpoints: sharedInbox && isHttpUri(sharedInbox) ? { sharedInbox } : null,
      id,
      inboxId,
    };
  } catch {
    return null;
  }
};

const quoteAuthorizationUri = (canonicalOrigin: string, requestUri: string): string =>
  new URL(`/ap/quote-authorization/${encodeURIComponent(requestUri)}`, canonicalOrigin).href;

const observeQuoteValidation = ({
  activityType,
  actorOrigin,
  handler,
  objectOrigin,
  reasonCode,
}: {
  readonly activityType: 'Accept' | 'Delete' | 'QuoteRequest' | 'Reject';
  readonly actorOrigin?: string;
  readonly handler: 'accept' | 'delete' | 'quote' | 'reject';
  readonly objectOrigin?: string;
  readonly reasonCode: string;
}) =>
  observeInbound({
    activityType,
    actorOrigin,
    handler,
    objectOrigin,
    outcome: 'rejected',
    phase: 'protocol',
    reasonCode,
  });

const requestMatchesConsent = (request: QuoteRequest, consent: PostQuoteConsentRow): boolean =>
  request.id?.href === consent.requestUri &&
  request.actorId?.href === consent.quoteAuthorActorUri &&
  request.objectId?.href === consent.sourceUri &&
  request.instrumentId?.href === consent.quoteUri;

const loadVerifiedQuoteRequest = async (
  context: InboxContext<void>,
  request: QuoteRequest,
): Promise<{
  readonly actorUri: URL;
  readonly instrument: Note;
  readonly instrumentUri: URL;
  readonly quotePostId: string | null;
  readonly requestUri: URL;
  readonly sourcePostId: string;
  readonly sourceUri: URL;
  readonly sourceAuthorProfileId: string;
  readonly sourceAuthorActorUri: URL;
  readonly sourceCanonicalOrigin: string;
} | null> => {
  const actorUri = request.actorId;
  const requestUri = request.id;
  const sourceUri = request.objectId;
  const instrumentUri = request.instrumentId;
  if (
    !isUsableHttpUri(actorUri) ||
    !isUsableHttpUri(requestUri) ||
    !isUsableHttpUri(sourceUri) ||
    !isUsableHttpUri(instrumentUri)
  ) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri?.origin,
      handler: 'quote',
      objectOrigin: sourceUri?.origin,
      reasonCode: 'quote_request_identity_invalid',
    });
    return null;
  }

  // Resolve the local Source before looking up or materializing the remote
  // quote author. This keeps invalid requests from exposing remote profiles.
  const sourcePostId = await findPostByActivityPubUri(context, sourceUri);
  if (!sourcePostId) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri.origin,
      handler: 'quote',
      objectOrigin: sourceUri.origin,
      reasonCode: 'quote_request_source_missing',
    });
    return null;
  }

  const source = await loadQuoteSourceIdentity(coreDb, sourcePostId);
  if (
    !source ||
    source.instanceKind !== InstanceKind.LOCAL ||
    !source.canonicalOrigin ||
    source.authorProfileState !== ProfileState.ACTIVE ||
    source.instanceState === InstanceState.SUSPENDED ||
    source.sourceUri !== sourceUri.href ||
    source.sourceState !== PostState.ACTIVE ||
    source.sourceContentId === null ||
    (source.sourceVisibility !== PostVisibility.PUBLIC &&
      source.sourceVisibility !== PostVisibility.UNLISTED)
  ) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri.origin,
      handler: 'quote',
      objectOrigin: sourceUri.origin,
      reasonCode: 'quote_request_source_not_quoteable',
    });
    return null;
  }

  const localRecipient = await resolveInboundLocalRecipient(
    context,
    new URL(source.authorActorUri),
  );
  if (
    !localRecipient ||
    localRecipient.id !== source.authorProfileId ||
    context.getActorUri(localRecipient.id).href !== source.authorActorUri
  ) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri.origin,
      handler: 'quote',
      objectOrigin: sourceUri.origin,
      reasonCode: 'quote_request_recipient_mismatch',
    });
    return null;
  }

  const instrument = await request.getInstrument({
    crossOrigin: 'trust',
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (
    !(instrument instanceof Note) ||
    instrument.id?.href !== instrumentUri.href ||
    instrument.quoteId?.href !== sourceUri.href ||
    instrument.quoteUrl?.href !== sourceUri.href
  ) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri.origin,
      handler: 'quote',
      objectOrigin: instrumentUri.origin,
      reasonCode: 'quote_request_instrument_invalid',
    });
    return null;
  }

  const instrumentAuthor = uniqueHref(instrument.attributionIds);
  if (instrumentAuthor !== actorUri.href) {
    observeQuoteValidation({
      activityType: 'QuoteRequest',
      actorOrigin: actorUri.origin,
      handler: 'quote',
      objectOrigin: instrumentUri.origin,
      reasonCode: 'quote_request_author_mismatch',
    });
    return null;
  }

  const quotePostId = await findPostByActivityPubUri(context, instrumentUri);
  if (quotePostId) {
    const quotePost = await coreDb
      .select({
        currentContentId: Posts.currentContentId,
        profileState: Profiles.state,
        state: Posts.state,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .where(eq(Posts.id, quotePostId))
      .limit(1)
      .then(first);
    const quoteIdentity = await loadQuotePostIdentity(coreDb, quotePostId);
    if (
      !quotePost ||
      quotePost.state !== PostState.ACTIVE ||
      quotePost.currentContentId === null ||
      quotePost.profileState !== ProfileState.ACTIVE ||
      !quoteIdentity ||
      quoteIdentity.quoteUri !== instrumentUri.href ||
      quoteIdentity.authorActorUri !== actorUri.href
    ) {
      observeQuoteValidation({
        activityType: 'QuoteRequest',
        actorOrigin: actorUri.origin,
        handler: 'quote',
        objectOrigin: instrumentUri.origin,
        reasonCode: 'quote_request_quote_identity_mismatch',
      });
      return null;
    }
  }

  return {
    actorUri,
    instrument,
    instrumentUri,
    requestUri,
    quotePostId: quotePostId ?? null,
    sourcePostId,
    sourceUri,
    sourceAuthorProfileId: source.authorProfileId,
    sourceAuthorActorUri: new URL(source.authorActorUri),
    sourceCanonicalOrigin: source.canonicalOrigin,
  };
};

const sendQuoteDecision = async ({
  context,
  decision,
  localProfileId,
  quoteAuthorization,
  quoteRequest,
  recipient,
}: {
  readonly context: InboxContext<void>;
  readonly decision: 'accept' | 'reject';
  readonly localProfileId: string;
  readonly quoteAuthorization?: QuoteAuthorization;
  readonly quoteRequest: QuoteRequest;
  readonly recipient: NonNullable<ReturnType<typeof remoteRecipient>>;
}): Promise<void> => {
  const actor = context.getActorUri(localProfileId);
  const activity =
    decision === 'accept'
      ? new Accept({
          actor,
          object: quoteRequest,
          result: quoteAuthorization,
          tos: [recipient.id],
        })
      : new Reject({ actor, object: quoteRequest, tos: [recipient.id] });

  try {
    await context.sendActivity({ identifier: localProfileId }, recipient, activity);
  } catch (error) {
    observeInbound({
      activityType: 'QuoteRequest',
      actorOrigin: recipient.id.origin,
      handler: 'quote',
      objectOrigin: quoteRequest.objectId?.origin,
      outcome: 'external_failure',
      phase: 'delivery',
      reasonCode: `${decision}_quote_delivery_failed`,
    });
    throw error;
  }
};

export const handleInboundQuoteRequest = async (
  context: InboxContext<void>,
  request: QuoteRequest,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const verified = await loadVerifiedQuoteRequest(context, request);
  if (!verified) {
    return;
  }

  let remoteActor;
  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({
      actorUri: verified.actorUri,
      context,
      now: receivedAt,
    });
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof RemoteActorMaterializationError
    ) {
      observeInbound({
        activityType: 'QuoteRequest',
        actorOrigin: verified.actorUri.origin,
        handler: 'quote',
        objectOrigin: verified.sourceUri.origin,
        outcome: 'external_failure',
        phase: 'actor_lookup',
        reasonCode: 'quote_request_actor_unavailable',
      });
      return;
    }
    throw error;
  }

  const decision = await recordInboundQuoteRequest({
    approvalUri: quoteAuthorizationUri(verified.sourceCanonicalOrigin, verified.requestUri.href),
    quoteAuthorActorUri: verified.actorUri.href,
    quoteAuthorProfileId: remoteActor.profile.id,
    quotePostId: verified.quotePostId ?? null,
    quoteUri: verified.instrumentUri.href,
    requestUri: verified.requestUri.href,
    sourceAuthorActorUri: verified.sourceAuthorActorUri.href,
    sourcePostId: verified.sourcePostId,
    sourceUri: verified.sourceUri.href,
  });
  const { consent } = decision;

  const recipient = remoteRecipient(remoteActor.actor);
  if (!recipient) {
    if (decision.receiptId) {
      await completePostQuoteEffectReceipt(decision.receiptId);
    }
    observeInbound({
      activityType: 'QuoteRequest',
      actorOrigin: verified.actorUri.origin,
      handler: 'quote',
      objectOrigin: verified.sourceUri.origin,
      outcome: 'noop',
      phase: 'delivery',
      reasonCode: 'quote_request_actor_inbox_missing',
    });
    return;
  }

  if (decision.accepted && consent.approvalUri) {
    await sendQuoteDecision({
      context,
      decision: 'accept',
      localProfileId: verified.sourceAuthorProfileId,
      quoteAuthorization: new QuoteAuthorization({
        attribution: verified.sourceAuthorActorUri,
        id: new URL(consent.approvalUri),
        interactingObject: verified.instrumentUri,
        interactionTarget: verified.sourceUri,
      }),
      quoteRequest: request,
      recipient,
    });
    if (decision.receiptId) {
      await completePostQuoteEffectReceipt(decision.receiptId);
    }
    return;
  }

  await sendQuoteDecision({
    context,
    decision: 'reject',
    localProfileId: verified.sourceAuthorProfileId,
    quoteRequest: request,
    recipient,
  });
  if (decision.receiptId) {
    await completePostQuoteEffectReceipt(decision.receiptId);
  }
};

const observeResponseMismatch = (
  activityType: 'Accept' | 'Reject',
  actorUri: URL,
  requestUri: URL,
  reasonCode: string,
) =>
  observeQuoteValidation({
    activityType,
    actorOrigin: actorUri.origin,
    handler: activityType === 'Accept' ? 'accept' : 'reject',
    objectOrigin: requestUri.origin,
    reasonCode,
  });

const forwardQuoteRevocation = async (
  context: InboxContext<void>,
  consent: PostQuoteConsentRow,
): Promise<void> => {
  if (!consent.quotePostId) {
    return;
  }

  const quote = await coreDb
    .select({ profileId: Profiles.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, consent.quotePostId),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!quote) {
    return;
  }

  await context.forwardActivity({ identifier: quote.profileId }, 'followers', {
    skipIfUnsigned: true,
  });
};

const forwardClaimedQuoteRevocation = async (
  context: InboxContext<void>,
  consent: PostQuoteConsentRow,
  approvalUri: string,
  forwardingAt: Temporal.Instant,
): Promise<void> => {
  try {
    await forwardQuoteRevocation(context, consent);
    await coreDb
      .update(PostQuoteRevocations)
      .set({ forwardedAt: sql`now()`, forwardingAt: null })
      .where(
        and(
          eq(PostQuoteRevocations.approvalUri, approvalUri),
          eq(PostQuoteRevocations.forwardingAt, forwardingAt),
        ),
      );
  } catch (error) {
    await coreDb
      .update(PostQuoteRevocations)
      .set({ forwardingAt: null })
      .where(
        and(
          eq(PostQuoteRevocations.approvalUri, approvalUri),
          isNull(PostQuoteRevocations.forwardedAt),
          eq(PostQuoteRevocations.forwardingAt, forwardingAt),
        ),
      );
    throw error;
  }
};

export const handleInboundQuoteAccept = async ({
  accept,
  context,
  request,
}: {
  readonly accept: Accept;
  readonly context: InboxContext<void>;
  readonly request: QuoteRequest;
}): Promise<void> => {
  const actorUri = accept.actorId;
  const requestUri = accept.objectId;
  if (!isUsableHttpUri(actorUri) || !isUsableHttpUri(requestUri)) {
    observeResponseMismatch(
      'Accept',
      actorUri ?? new URL('https://invalid.example'),
      requestUri ?? new URL('https://invalid.example'),
      'quote_accept_identity_invalid',
    );
    return;
  }

  const consent = await loadQuoteConsentByRequestUri(coreDb, requestUri.href);
  if (!consent) {
    observeInbound({
      activityType: 'Accept',
      actorOrigin: actorUri.origin,
      handler: 'accept',
      objectOrigin: requestUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'quote_accept_request_missing',
    });
    return;
  }
  if (consent.sourceAuthorActorUri !== actorUri.href || !requestMatchesConsent(request, consent)) {
    observeResponseMismatch(
      'Accept',
      actorUri,
      requestUri,
      'quote_accept_request_binding_mismatch',
    );
    return;
  }

  const resultUri = accept.resultId;
  const result = await accept.getResult({
    crossOrigin: 'trust',
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (
    !isUsableHttpUri(resultUri) ||
    !(result instanceof QuoteAuthorization) ||
    result.id?.href !== resultUri?.href ||
    (consent.approvalUri !== null && consent.approvalUri !== resultUri.href) ||
    uniqueHref(result.attributionIds) !== actorUri.href ||
    result.interactingObjectId?.href !== consent.quoteUri ||
    result.interactionTargetId?.href !== consent.sourceUri ||
    resultUri.origin !== actorUri.origin
  ) {
    observeResponseMismatch('Accept', actorUri, requestUri, 'quote_accept_authorization_invalid');
    return;
  }

  await applyInboundQuoteAccept({
    approvalUri: resultUri.href,
    quoteUri: consent.quoteUri,
    requestUri: consent.requestUri,
    sourceAuthorActorUri: actorUri.href,
    sourceUri: consent.sourceUri,
  });
};

export const handleInboundQuoteReject = async ({
  reject,
  request,
}: {
  readonly reject: Reject;
  readonly request: QuoteRequest;
}): Promise<void> => {
  const actorUri = reject.actorId;
  const requestUri = reject.objectId;
  if (!isUsableHttpUri(actorUri) || !isUsableHttpUri(requestUri)) {
    observeResponseMismatch(
      'Reject',
      actorUri ?? new URL('https://invalid.example'),
      requestUri ?? new URL('https://invalid.example'),
      'quote_reject_identity_invalid',
    );
    return;
  }

  const consent = await loadQuoteConsentByRequestUri(coreDb, requestUri.href);
  if (!consent) {
    observeInbound({
      activityType: 'Reject',
      actorOrigin: actorUri.origin,
      handler: 'reject',
      objectOrigin: requestUri.origin,
      outcome: 'noop',
      phase: 'projection',
      reasonCode: 'quote_reject_request_missing',
    });
    return;
  }
  if (consent.sourceAuthorActorUri !== actorUri.href || !requestMatchesConsent(request, consent)) {
    observeResponseMismatch(
      'Reject',
      actorUri,
      requestUri,
      'quote_reject_request_binding_mismatch',
    );
    return;
  }

  await applyInboundQuoteReject({
    requestUri: consent.requestUri,
    sourceAuthorActorUri: actorUri.href,
  });
};

export const handleInboundQuoteRevocation = async (
  context: InboxContext<void>,
  activity: Delete,
): Promise<boolean> => {
  const actorUri = activity.actorId;
  const approvalUri = activity.objectId;
  if (!isUsableHttpUri(actorUri) || !isUsableHttpUri(approvalUri)) {
    return false;
  }

  const targetHrefs = activity.targetIds.map(({ href }) => href);
  const embedded = await activity.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  const consent = await loadQuoteConsentByApprovalUri(coreDb, approvalUri.href);
  if (!consent) {
    const sourceUri = targetHrefs.length === 1 ? targetHrefs[0] : undefined;
    const embeddedQuoteUri =
      embedded instanceof QuoteAuthorization ? embedded.interactingObjectId?.href : undefined;
    if (
      approvalUri.origin !== actorUri.origin ||
      !sourceUri ||
      (embedded !== null &&
        (!(embedded instanceof QuoteAuthorization) ||
          embedded.id?.href !== approvalUri.href ||
          uniqueHref(embedded.attributionIds) !== actorUri.href ||
          !embeddedQuoteUri ||
          embedded.interactionTargetId?.href !== sourceUri))
    ) {
      return false;
    }
    const pendingConsent = await loadPendingQuoteConsentByBinding(coreDb, {
      quoteUri: embeddedQuoteUri,
      sourceAuthorActorUri: actorUri.href,
      sourceUri,
    });
    if (!pendingConsent) {
      return false;
    }
    const revocation = await applyInboundQuoteRevocation({
      approvalUri: approvalUri.href,
      consentId: pendingConsent.id,
      quoteUri: embeddedQuoteUri ?? pendingConsent.quoteUri,
      sourceAuthorActorUri: actorUri.href,
      sourceUri,
    });
    if (revocation?.forwardingAt) {
      await forwardClaimedQuoteRevocation(
        context,
        revocation.consent,
        approvalUri.href,
        revocation.forwardingAt,
      );
    }
    return revocation !== null;
  }

  if (
    consent.sourceAuthorActorUri !== actorUri.href ||
    approvalUri.origin !== actorUri.origin ||
    targetHrefs.length !== 1 ||
    targetHrefs[0] !== consent.sourceUri ||
    (embedded !== null &&
      (!(embedded instanceof QuoteAuthorization) ||
        embedded.id?.href !== approvalUri.href ||
        uniqueHref(embedded.attributionIds) !== actorUri.href ||
        embedded.interactingObjectId?.href !== consent.quoteUri ||
        embedded.interactionTargetId?.href !== consent.sourceUri))
  ) {
    observeQuoteValidation({
      activityType: 'Delete',
      actorOrigin: actorUri.origin,
      handler: 'delete',
      objectOrigin: approvalUri.origin,
      reasonCode: 'quote_revocation_binding_mismatch',
    });
    return true;
  }

  const revocation = await applyInboundQuoteRevocation({
    approvalUri: approvalUri.href,
    quoteUri: consent.quoteUri,
    sourceAuthorActorUri: actorUri.href,
    sourceUri: consent.sourceUri,
  });
  if (
    revocation?.forwardingAt &&
    (consent.status === PostQuoteConsentStatus.APPROVED ||
      consent.status === PostQuoteConsentStatus.REVOKED)
  ) {
    await forwardClaimedQuoteRevocation(
      context,
      revocation.consent,
      approvalUri.href,
      revocation.forwardingAt,
    );
  }
  return true;
};
