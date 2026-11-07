import type { WorkflowDefinition } from './client';

export const naturalLanguageMuteConditionMaxLength = 250;

export const isNaturalLanguageMuteConditionWithinLimit = (condition: string): boolean => {
  if (condition.length > naturalLanguageMuteConditionMaxLength * 2) {
    return false;
  }

  const codePoints = condition[Symbol.iterator]();
  let codePointCount = 0;
  while (codePointCount <= naturalLanguageMuteConditionMaxLength) {
    if (codePoints.next().done) {
      return true;
    }
    codePointCount += 1;
  }

  return false;
};

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
