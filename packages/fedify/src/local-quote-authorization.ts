import { QuoteAuthorization } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import {
  loadQuoteConsentByApprovalUri,
  loadQuotePostIdentity,
  loadQuoteSourceIdentity,
} from '@kosmo/core/services';
import { and, eq, isNotNull } from 'drizzle-orm';
import { authorizeLocalPostNote } from './local-post-note';
import type { RequestContext } from '@fedify/fedify';

type QuoteAuthorizationProjection = {
  readonly approvalUri: string;
  readonly quoteUri: string;
  readonly sourcePostId: string;
  readonly sourceUri: string;
  readonly sourceAuthorActorUri: string;
};

const loadProjection = async (
  context: RequestContext<void>,
): Promise<QuoteAuthorizationProjection | null> => {
  const consent = await loadQuoteConsentByApprovalUri(db, context.url.href);
  if (!consent || consent.status !== PostQuoteConsentStatus.APPROVED || !consent.approvalUri) {
    return null;
  }

  const source = await loadQuoteSourceIdentity(db, consent.sourcePostId);
  if (
    !source ||
    source.instanceKind !== InstanceKind.LOCAL ||
    !source.canonicalOrigin ||
    source.authorProfileState !== ProfileState.ACTIVE ||
    source.instanceState === InstanceState.SUSPENDED ||
    source.sourceState !== PostState.ACTIVE ||
    source.sourceContentId === null ||
    (source.sourceVisibility !== PostVisibility.PUBLIC &&
      source.sourceVisibility !== PostVisibility.UNLISTED) ||
    source.sourceUri !== consent.sourceUri ||
    source.authorActorUri !== consent.sourceAuthorActorUri
  ) {
    return null;
  }

  if (consent.quotePostId !== null) {
    const quote = await db
      .select({
        authorProfileId: Profiles.id,
        authorActorUri: ActivityPubActors.uri,
        currentContentId: Posts.currentContentId,
        repostSourceId: Posts.repostSourceId,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(
        and(
          eq(Posts.id, consent.quotePostId),
          eq(Posts.state, PostState.ACTIVE),
          isNotNull(Posts.currentContentId),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    if (!quote || quote.repostSourceId !== consent.sourcePostId) {
      return null;
    }

    const quoteIdentity = await loadQuotePostIdentity(db, consent.quotePostId);
    if (
      !quoteIdentity ||
      quoteIdentity.quoteUri !== consent.quoteUri ||
      quoteIdentity.authorActorUri !== consent.quoteAuthorActorUri ||
      (quote.authorActorUri !== null && quote.authorActorUri !== consent.quoteAuthorActorUri)
    ) {
      return null;
    }
  }

  return {
    approvalUri: consent.approvalUri!,
    quoteUri: consent.quoteUri,
    sourcePostId: consent.sourcePostId,
    sourceUri: consent.sourceUri,
    sourceAuthorActorUri: consent.sourceAuthorActorUri,
  };
};

export const authorizeLocalQuoteAuthorization = async (
  context: RequestContext<void>,
): Promise<boolean> => {
  const projection = await loadProjection(context);
  return projection ? authorizeLocalPostNote(context, { id: projection.sourcePostId }) : false;
};

export const dispatchLocalQuoteAuthorization = async (
  context: RequestContext<void>,
): Promise<QuoteAuthorization | null> => {
  const projection = await loadProjection(context);
  if (!projection || !(await authorizeLocalPostNote(context, { id: projection.sourcePostId }))) {
    return null;
  }

  return new QuoteAuthorization({
    attribution: new URL(projection.sourceAuthorActorUri),
    id: new URL(projection.approvalUri),
    interactingObject: new URL(projection.quoteUri),
    interactionTarget: new URL(projection.sourceUri),
  });
};
