import type { WorkflowDefinition } from './client';

export const naturalLanguageMuteConditionMaxLength = 250;

type NaturalLanguageMuteCommandIdentity = {
  readonly commandId: string;
  readonly ownerProfileId: string;
};

export type NaturalLanguageMuteCommand = NaturalLanguageMuteCommandIdentity &
  (
    | { readonly action: 'CREATE'; readonly condition: string }
    | { readonly action: 'UPDATE'; readonly ruleId: string; readonly condition: string }
    | { readonly action: 'DELETE'; readonly ruleId: string }
  );

export type NaturalLanguageMuteRuleSnapshot = {
  readonly id: string;
  readonly ownerProfileId: string;
  readonly condition: string;
};

export type NaturalLanguageMuteResult =
  | { readonly rule: NaturalLanguageMuteRuleSnapshot; readonly deletedRuleId?: never }
  | { readonly deletedRuleId: string; readonly rule?: never };

export const naturalLanguageMuteRuleWorkflow: WorkflowDefinition<
  (input: NaturalLanguageMuteCommand) => Promise<NaturalLanguageMuteResult>
> = {
  workflow: 'naturalLanguageMuteRuleWorkflow',
  workflowIdFromArgs: (input) =>
    `natural-language-mute-rule:${input.ownerProfileId}:${input.commandId}`,
};
