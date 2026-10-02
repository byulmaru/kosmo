import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  getDatabaseConnection,
  Instances,
  Posts,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  ProfileState,
} from '../enums';
import type { DatabaseHandle, Transaction } from '../db';
import type { PostQuoteConsentStatus as PostQuoteConsentStatusType } from '../enums';

type QuoteConsentIdentity = {
  readonly quote: {
    readonly postId: string;
    readonly profileId: string;
    readonly uri: string;
    readonly authorActorUri: string;
  };
  readonly source: {
    readonly postId: string;
    readonly profileId: string;
    readonly uri: string;
    readonly authorActorUri: string;
  };
};

type QuoteConsentExpectation = QuoteConsentIdentity & {
  readonly expectedRepostSourceId: string | null;
  readonly expectedStatus: PostQuoteConsentStatusType | null;
  readonly expectedApprovalUri: string | null;
};

type QuoteConsentResolveOperation =
  | {
      readonly operation: 'RESOLVE';
      readonly result: 'PENDING';
      /** Remote-issued Authorization reference, including an unverified candidate. */
      readonly approvalUri: string | null;
      readonly quoteAuthorActorUri: string;
    }
  | {
      readonly operation: 'RESOLVE';
      readonly result: 'APPROVED';
      readonly quoteAuthorActorUri: string;
      readonly proof:
        | {
            readonly kind: 'AUTHORIZATION';
            readonly approvalUri: string;
            readonly issuerActorUri: string;
          }
        | { readonly kind: 'SELF' }
        | { readonly kind: 'LEGACY_QUOTE_URL' };
    };

type QuoteConsentOperation =
  | {
      readonly operation: 'DECIDE';
      readonly result: 'APPROVED' | 'REJECTED';
      readonly issuerActorUri: string;
    }
  | QuoteConsentResolveOperation
  | {
      readonly operation: 'REVOKE';
      readonly approvalUri: string;
      readonly issuerActorUri: string;
    };

export type ApplyPostQuoteConsentInput = QuoteConsentExpectation & QuoteConsentOperation;

type PostIdentity = {
  readonly postId: string;
  readonly profileId: string;
  readonly state: string;
  readonly currentContentId: string | null;
  readonly repostSourceId: string | null;
  readonly quoteConsentStatus: PostQuoteConsentStatusType | null;
  readonly quoteConsentApprovalUri: string | null;
  readonly uri: string | null;
  readonly authorActorUri: string | null;
  readonly instanceKind: InstanceKind;
  readonly instanceState: InstanceState;
  readonly authorProfileState: ProfileState;
  readonly canonicalOrigin: string | null;
};

export type AppliedPostQuoteConsent = {
  readonly changed: boolean;
  readonly quote: QuoteConsentIdentity['quote'];
  readonly source: QuoteConsentIdentity['source'];
  readonly repostSourceId: string;
  readonly status: PostQuoteConsentStatusType;
  readonly approvalUri: string | null;
};

const loadPostIdentity = async (tx: Transaction, postId: string) =>
  tx
    .select({
      authorActorUri: ActivityPubActors.uri,
      canonicalOrigin: Instances.canonicalOrigin,
      currentContentId: Posts.currentContentId,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      postId: Posts.id,
      profileId: Posts.profileId,
      quoteConsentApprovalUri: Posts.quoteConsentApprovalUri,
      quoteConsentStatus: Posts.quoteConsentStatus,
      repostSourceId: Posts.repostSourceId,
      state: Posts.state,
      uri: ActivityPubPosts.uri,
      authorProfileState: Profiles.state,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then((rows) => rows[0] as PostIdentity | undefined)
    .then((post) => {
      if (!post) {
        return undefined;
      }

      const localActorUri =
        post.instanceKind === InstanceKind.LOCAL && post.canonicalOrigin
          ? new URL(`/ap/actor/${post.profileId}`, post.canonicalOrigin).href
          : null;
      const localPostUri =
        post.instanceKind === InstanceKind.LOCAL && post.canonicalOrigin
          ? new URL(`/ap/note/${post.postId}`, post.canonicalOrigin).href
          : null;

      return {
        ...post,
        authorActorUri: post.authorActorUri ?? localActorUri,
        uri: post.uri ?? localPostUri,
      } satisfies PostIdentity;
    });

const matchesIdentity = (post: PostIdentity, expected: QuoteConsentIdentity['quote']) =>
  post.postId === expected.postId &&
  post.profileId === expected.profileId &&
  post.uri === expected.uri &&
  post.authorActorUri === expected.authorActorUri;

const identityStillMatchesSql = ({
  authorActorUri,
  postId,
  profileId,
  uri,
}: QuoteConsentIdentity['quote']) => sql`EXISTS (
  SELECT 1
  FROM "post" AS quote_post
  INNER JOIN "profile" AS quote_profile ON quote_profile.id = quote_post.profile_id
  INNER JOIN "instance" AS quote_instance ON quote_instance.id = quote_profile.instance_id
  LEFT JOIN "activitypub_post" AS quote_activitypub_post ON quote_activitypub_post.post_id = quote_post.id
  LEFT JOIN "activitypub_actor" AS quote_activitypub_actor ON quote_activitypub_actor.profile_id = quote_profile.id
  WHERE quote_post.id = ${postId}
    AND quote_post.profile_id = ${profileId}
    AND COALESCE(
      quote_activitypub_post.uri,
      CASE WHEN quote_instance.kind = 'LOCAL' AND quote_instance.canonical_origin IS NOT NULL
        THEN quote_instance.canonical_origin || '/ap/note/' || quote_post.id::text
        ELSE NULL
      END
    ) = ${uri}
    AND COALESCE(
      quote_activitypub_actor.uri,
      CASE WHEN quote_instance.kind = 'LOCAL' AND quote_instance.canonical_origin IS NOT NULL
        THEN quote_instance.canonical_origin || '/ap/actor/' || quote_profile.id::text
        ELSE NULL
      END
    ) = ${authorActorUri}
)`;

const transitionAllowed = (input: ApplyPostQuoteConsentInput) => {
  const { expectedApprovalUri, expectedStatus } = input;

  switch (input.operation) {
    case 'DECIDE':
      return (
        expectedStatus === null ||
        expectedStatus === PostQuoteConsentStatus.PENDING ||
        (input.result === PostQuoteConsentStatus.APPROVED &&
          expectedStatus === PostQuoteConsentStatus.APPROVED &&
          expectedApprovalUri === null)
      );
    case 'RESOLVE':
      return (
        expectedStatus === null ||
        expectedStatus === PostQuoteConsentStatus.PENDING ||
        expectedStatus === PostQuoteConsentStatus.APPROVED
      );
    case 'REVOKE':
      return (
        (expectedStatus === PostQuoteConsentStatus.PENDING ||
          expectedStatus === PostQuoteConsentStatus.APPROVED) &&
        (expectedApprovalUri === null || input.approvalUri === expectedApprovalUri) &&
        input.approvalUri.length > 0
      );
  }
};

const getNextConsent = (
  input: ApplyPostQuoteConsentInput,
  source: PostIdentity,
): { readonly status: PostQuoteConsentStatusType; readonly approvalUri: string | null } => {
  switch (input.operation) {
    case 'DECIDE':
      return { status: input.result, approvalUri: null };
    case 'RESOLVE':
      if (input.result === PostQuoteConsentStatus.PENDING) {
        return {
          status: input.result,
          // Local Source authorizations are derived from the Quote Post ID by their caller.
          approvalUri: source.instanceKind === InstanceKind.LOCAL ? null : input.approvalUri,
        };
      }

      return {
        status: input.result,
        approvalUri:
          source.instanceKind === InstanceKind.LOCAL || input.proof.kind !== 'AUTHORIZATION'
            ? null
            : input.proof.approvalUri,
      };
    case 'REVOKE':
      return {
        status: PostQuoteConsentStatus.REVOKED,
        approvalUri: source.instanceKind === InstanceKind.LOCAL ? null : input.approvalUri,
      };
  }
};

const operationIssuerMatches = (input: ApplyPostQuoteConsentInput) => {
  switch (input.operation) {
    case 'DECIDE':
    case 'REVOKE':
      return input.issuerActorUri === input.source.authorActorUri;
    case 'RESOLVE':
      if (input.quoteAuthorActorUri !== input.quote.authorActorUri) {
        return false;
      }
      if (input.result === PostQuoteConsentStatus.PENDING) {
        return true;
      }

      switch (input.proof.kind) {
        case 'AUTHORIZATION':
          return (
            input.proof.approvalUri.length > 0 &&
            input.proof.issuerActorUri === input.source.authorActorUri
          );
        case 'SELF':
          return input.quote.profileId === input.source.profileId;
        case 'LEGACY_QUOTE_URL':
          return true;
      }
  }
};

const authorEligibilityStillMatchesSql = (
  identity: QuoteConsentIdentity['quote'],
  requireLocalInstance = false,
) => sql`EXISTS (
  SELECT 1
  FROM "post" AS eligible_post
  INNER JOIN "profile" AS eligible_profile ON eligible_profile.id = eligible_post.profile_id
  INNER JOIN "instance" AS eligible_instance ON eligible_instance.id = eligible_profile.instance_id
  WHERE eligible_post.id = ${identity.postId}
    AND eligible_post.profile_id = ${identity.profileId}
    AND eligible_profile.state = 'ACTIVE'
    AND eligible_instance.state <> 'SUSPENDED'
    ${requireLocalInstance ? sql`AND eligible_instance.kind = 'LOCAL'` : sql``}
)`;

const localAuthorizationUri = (source: PostIdentity, quotePostId: string) =>
  source.instanceKind === InstanceKind.LOCAL && source.canonicalOrigin
    ? new URL(`/ap/quote-authorization/${quotePostId}`, source.canonicalOrigin).href
    : null;

/**
 * Applies a Quote decision, signed Note resolution, or Authorization revocation.
 * The caller supplies identities verified from the protocol event; the write
 * checks those identities and the expected Post state again in its SQL CAS.
 */
export const applyPostQuoteConsent = async (
  input: ApplyPostQuoteConsentInput,
  handle?: DatabaseHandle,
): Promise<AppliedPostQuoteConsent | null> => {
  if (!transitionAllowed(input)) {
    return null;
  }

  return getDatabaseConnection(handle).transaction(async (tx) => {
    const quote = await loadPostIdentity(tx, input.quote.postId);
    const source = await loadPostIdentity(tx, input.source.postId);
    if (
      !quote ||
      !source ||
      !matchesIdentity(quote, input.quote) ||
      !matchesIdentity(source, input.source)
    ) {
      return null;
    }

    if (
      quote.currentContentId === null ||
      quote.state !== PostState.ACTIVE ||
      (input.operation !== 'REVOKE' &&
        (quote.authorProfileState !== ProfileState.ACTIVE ||
          quote.instanceState === InstanceState.SUSPENDED)) ||
      (input.operation !== 'REVOKE' &&
        (source.currentContentId === null ||
          source.state !== PostState.ACTIVE ||
          source.authorProfileState !== ProfileState.ACTIVE ||
          source.instanceState === InstanceState.SUSPENDED)) ||
      (input.operation === 'DECIDE' &&
        (source.instanceKind !== InstanceKind.LOCAL ||
          source.instanceState !== InstanceState.ACTIVE)) ||
      quote.repostSourceId !== input.expectedRepostSourceId ||
      (quote.repostSourceId !== null && quote.repostSourceId !== source.postId) ||
      quote.quoteConsentStatus !== input.expectedStatus ||
      quote.quoteConsentApprovalUri !== input.expectedApprovalUri ||
      !operationIssuerMatches(input)
    ) {
      return null;
    }

    if (
      input.operation === 'REVOKE' &&
      (input.approvalUri.length === 0 ||
        (source.instanceKind === InstanceKind.LOCAL
          ? input.expectedApprovalUri !== null ||
            input.approvalUri !== localAuthorizationUri(source, quote.postId)
          : input.approvalUri !== quote.quoteConsentApprovalUri))
    ) {
      return null;
    }

    const next = getNextConsent(input, source);
    const sameValue =
      quote.repostSourceId === source.postId &&
      quote.quoteConsentStatus === next.status &&
      quote.quoteConsentApprovalUri === next.approvalUri;
    if (sameValue) {
      return {
        changed: false,
        quote: input.quote,
        source: input.source,
        repostSourceId: source.postId,
        status: next.status,
        approvalUri: next.approvalUri,
      };
    }

    const updated = await tx
      .update(Posts)
      .set({
        quoteConsentApprovalUri: next.approvalUri,
        quoteConsentStatus: next.status,
        ...(quote.repostSourceId === null ? { repostSourceId: source.postId } : {}),
      })
      .where(
        and(
          eq(Posts.id, quote.postId),
          eq(Posts.profileId, quote.profileId),
          eq(Posts.state, PostState.ACTIVE),
          eq(Posts.currentContentId, quote.currentContentId),
          input.expectedRepostSourceId === null
            ? isNull(Posts.repostSourceId)
            : eq(Posts.repostSourceId, input.expectedRepostSourceId),
          input.expectedStatus === null
            ? isNull(Posts.quoteConsentStatus)
            : eq(Posts.quoteConsentStatus, input.expectedStatus),
          input.expectedApprovalUri === null
            ? isNull(Posts.quoteConsentApprovalUri)
            : eq(Posts.quoteConsentApprovalUri, input.expectedApprovalUri),
          identityStillMatchesSql(input.quote),
          identityStillMatchesSql(input.source),
          ...(input.operation === 'REVOKE'
            ? []
            : [
                authorEligibilityStillMatchesSql(input.quote),
                authorEligibilityStillMatchesSql(input.source, input.operation === 'DECIDE'),
              ]),
          sql`EXISTS (
            SELECT 1 FROM "post" AS consent_source
            WHERE consent_source.id = ${source.postId}
              AND consent_source.profile_id = ${source.profileId}
              AND ${
                source.currentContentId === null
                  ? sql`consent_source.current_content_id IS NULL`
                  : sql`consent_source.current_content_id = ${source.currentContentId}`
              }
              AND consent_source.state = ${source.state}
          )`,
        ),
      )
      .returning({ id: Posts.id });

    if (updated.length === 0) {
      return null;
    }

    return {
      changed: true,
      quote: input.quote,
      source: input.source,
      repostSourceId: source.postId,
      status: next.status,
      approvalUri: next.approvalUri,
    };
  });
};

/** Revokes consent attached to a Source as part of that Source's deletion transaction. */
export const revokePostQuoteConsentsForSource = async (tx: Transaction, sourcePostId: string) =>
  tx
    .update(Posts)
    .set({ quoteConsentStatus: PostQuoteConsentStatus.REVOKED })
    .where(
      and(
        eq(Posts.repostSourceId, sourcePostId),
        inArray(Posts.quoteConsentStatus, [
          PostQuoteConsentStatus.PENDING,
          PostQuoteConsentStatus.APPROVED,
        ]),
      ),
    );
