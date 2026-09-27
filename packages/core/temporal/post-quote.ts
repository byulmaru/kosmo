import type { WorkflowUpdateDefinition } from './client';

export type PostQuoteCommand =
  | {
      readonly kind: 'request';
      readonly approvalUri: string;
      readonly quoteAuthorActorUri: string;
      readonly quoteAuthorProfileId: string;
      readonly quotePostId: string;
      readonly quoteUri: string;
      readonly requestUri: string;
      readonly sourceAuthorActorUri: string;
      readonly sourcePostId: string;
      readonly sourceUri: string;
    }
  | {
      readonly kind: 'accept';
      readonly approvalUri: string;
      readonly quoteUri: string;
      readonly requestUri: string;
      readonly sourceAuthorActorUri: string;
      readonly sourceUri: string;
    }
  | {
      readonly kind: 'reject';
      readonly requestUri: string;
      readonly sourceAuthorActorUri: string;
    }
  | {
      readonly kind: 'revoke';
      readonly approvalUri: string;
      readonly consentId?: string;
      readonly quoteUri: string;
      readonly sourceAuthorActorUri: string;
      readonly sourceUri: string;
    };

export type PostQuoteCommandResult = {
  readonly forwardEligible: boolean;
  readonly consentId: string;
  readonly postId: string;
  readonly revision: number;
  readonly sourcePostId: string;
} | null;

export const postQuoteCommandWorkflow: WorkflowUpdateDefinition<
  (command: PostQuoteCommand) => Promise<void>,
  PostQuoteCommandResult
> = {
  workflow: 'postQuoteCommandWorkflow',
  workflowIdFromArgs: (command) =>
    `post-quote-${command.kind}:${command.kind === 'revoke' ? command.approvalUri : command.requestUri}`,
  update: 'postQuoteCommand',
};
