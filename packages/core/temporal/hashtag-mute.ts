import type { HashtagMuteDecision, HashtagMuteScope } from '../enums';
import type { WorkflowDefinition } from './client';

type CommandIdentity = {
  readonly commandId: string;
  readonly ownerProfileId: string;
};
export type HashtagMuteCommand = CommandIdentity &
  (
    | {
        readonly action: 'CREATE';
        readonly targetHashtagId: string;
        readonly scopes: HashtagMuteScope[];
        readonly decision: HashtagMuteDecision;
        readonly expiresAt: string | null;
      }
    | {
        readonly action: 'UPDATE';
        readonly ruleId: string;
        readonly scopes?: HashtagMuteScope[];
        readonly decision?: HashtagMuteDecision;
        readonly expiresAt?: string | null;
      }
    | { readonly action: 'DELETE'; readonly ruleId: string }
  );

export type HashtagMuteRuleSnapshot = {
  readonly id: string;
  readonly ownerProfileId: string;
  readonly targetHashtagId: string;
  readonly scopes: HashtagMuteScope[];
  readonly decision: HashtagMuteDecision;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type HashtagMuteResult =
  | { readonly rule: HashtagMuteRuleSnapshot; readonly deletedRuleId?: never }
  | { readonly deletedRuleId: string; readonly rule?: never };

export const hashtagMuteRuleWorkflow: WorkflowDefinition<
  (input: HashtagMuteCommand) => Promise<HashtagMuteResult>
> = {
  workflow: 'hashtagMuteRuleWorkflow',
  workflowIdFromArgs: (input) => `hashtag-mute-rule:${input.ownerProfileId}:${input.commandId}`,
};
