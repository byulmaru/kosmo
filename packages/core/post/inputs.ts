import type {
  PostQuoteConsentStatus as PostQuoteConsentStatusType,
  PostVisibility,
} from '../enums';
import type { PostContentDocumentV1 } from '../post-content';
import type { PostContentMentionReference } from '../post-content/server';

export type LegacyLocalPostInput = {
  admissionId?: string;
  accountId?: string;
  /**
   * Normalized authored body paired with `document`, supplied by the API after validating the
   * selected mention ranges. GraphQL clients send body text and ranges, never this value or a doc.
   */
  authoredBodyText?: string;
  document: PostContentDocumentV1;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
  visibility: PostVisibility;
};

export type LocalPostInput = {
  admissionId?: string;
  accountId?: string;
  bodyText: string;
  contentWarning?: string | null;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  mentions?: readonly PostContentMentionReference[];
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
  sensitiveMedia?: boolean;
  visibility: PostVisibility;
};

export type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  hashtagNames?: readonly string[];
  media?: readonly RemoteMediaCandidate[];
  mentionProfileIds: readonly string[];
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  replyParentId?: string;
  visibility: PostVisibility;
};

export type RemoteMediaCandidate = {
  altText: string | null;
  mediaType: string | null;
  url: string;
};

export type PostCreateInput = LocalPostInput | ActivityPubPostInput;

export type PostOrigin = 'LOCAL' | 'ACTIVITYPUB';

export type LocalRepostInput = {
  actorAccountId?: string;
  actorProfileId: string;
  origin: 'LOCAL';
  sourcePostId: string;
};

export type ActivityPubRepostInput = {
  activityUri: string;
  actorProfileId: string;
  origin: 'ACTIVITYPUB';
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  sourcePostId: string;
};

export type RepostInput = LocalRepostInput | ActivityPubRepostInput;

export type QuoteConsentIdentity = {
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
  /** Capture with expectedApprovalUri before asynchronous protocol proof verification. */
  readonly expectedStatus: PostQuoteConsentStatusType | null;
  /** Reuse the pre-verification value with expectedStatus in the write CAS. */
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
            /**
             * Pass only after freshly verifying the issuer's Authorization object from
             * the current Quote Note or correlated Accept: interactingObject,
             * interactionTarget, and attributedTo must match the Quote, Source, and
             * Source author. Never reuse proof cached from before revocation.
             */
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
  | {
      readonly operation: 'REJECT';
      readonly issuerActorUri: string;
    }
  | QuoteConsentResolveOperation
  | {
      readonly operation: 'REVOKE';
      readonly approvalUri: string;
      readonly issuerActorUri: string;
    };

/**
 * Capture the expected status and Authorization reference before asynchronous proof
 * verification, then pass that same snapshot to this compare-and-swap. An Authorization
 * URI is opaque and does not identify a grant generation: when an issuer reuses a URI,
 * current grant verification or reconciliation must come from the caller's protocol path.
 */
export type ApplyPostQuoteConsentInput = QuoteConsentExpectation & QuoteConsentOperation;
