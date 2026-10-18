import type { PostQuoteConsentStatus } from '../enums';
import type { ErrorCode } from '../error';
import type { LocalPostInput } from '../services/post';
import type { ApplyPostQuoteConsentInput } from '../services/post-quote-consent';
import type { WorkflowUpdateDefinition } from './client';

export type QuoteOwnerCommand = { readonly postId: string; readonly commandId: string } & (
  | {
      readonly kind: 'NOTE';
      readonly embeddedSource?: Record<string, unknown>;
      readonly malformed?: boolean;
      readonly actorUri: string;
      readonly targetUri: string;
      readonly format: 'FEP_044F' | 'LEGACY';
      readonly approvalUri: string | null;
      readonly authorizationUpdate: boolean;
      readonly duplicateCreate: boolean;
    }
  | {
      readonly kind: 'DELETE';
      readonly actorUri: string;
      readonly approvalUri: string;
      readonly activityId: string | null;
      readonly targetUri: string | null;
    }
  | {
      readonly kind: 'REQUEST';
      readonly sourcePostId: string;
      readonly requestUri: string;
      readonly sourceUri: string;
      readonly sourceAuthorActorUri: string;
      readonly quoteUri: string;
      readonly quoteAuthorActorUri: string;
      readonly quoteAuthorProfileId: string;
    }
  | {
      readonly kind: 'ACCEPT';
      readonly approvalUri: string;
      readonly requestUri: string;
      readonly sourceUri: string;
      readonly sourceAuthorActorUri: string;
      readonly quoteUri: string;
    }
  | { readonly kind: 'REJECT'; readonly requestUri: string; readonly sourceAuthorActorUri: string }
  | {
      readonly kind: 'INITIALIZE';
      readonly input: LocalPostInput;
      readonly initialContentId?: string;
    }
);
export type QuotePendingWithoutSource = {
  readonly postId: string;
  readonly profileId: string;
  readonly quoteUri: string;
  readonly actorUri: string;
  readonly currentContentId: string | null;
  readonly expectedStatus: PostQuoteConsentStatus | null;
  readonly expectedApprovalUri: string | null;
  readonly approvalUri: string | null;
};
export type PreparedQuoteConsent =
  | {
      readonly kind: 'CHANGE';
      readonly change: ApplyPostQuoteConsentInput;
      readonly retryable: boolean;
    }
  | {
      readonly kind: 'PENDING_WITHOUT_SOURCE';
      readonly pending: QuotePendingWithoutSource;
      readonly retryable: boolean;
    }
  | { readonly kind: 'NOOP'; readonly retryable: boolean };
export type QuoteOwnerResult = {
  readonly postId: string;
  readonly status: PostQuoteConsentStatus | null;
  readonly applied: boolean;
  readonly retryable: boolean;
  readonly error?: { readonly code: ErrorCode; readonly message: string; readonly field?: string };
};
export type QuoteOwnerState = {
  readonly postId: string;
  readonly initialSourcePostId?: string;
  readonly targetUri?: string;
  readonly seenApprovalUris?: readonly string[];
  readonly uncertainHistory?: boolean;
  readonly latestCommandId?: string;
  readonly completed?: readonly (readonly [string, QuoteOwnerResult])[];
  readonly pending?: readonly QuoteOwnerCommand[];
};
export const postQuoteOwnerWorkflow: WorkflowUpdateDefinition<
  (input: QuoteOwnerState) => Promise<void>,
  QuoteOwnerResult,
  [QuoteOwnerCommand]
> = {
  workflow: 'postQuoteOwnerWorkflow',
  update: 'quoteCommand',
  workflowIdFromArgs: (input) => `post-quote:${input.postId}`,
};
