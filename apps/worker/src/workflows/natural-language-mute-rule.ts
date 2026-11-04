import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type {
  NaturalLanguageMuteCommand,
  NaturalLanguageMuteResult,
} from '@kosmo/core/temporal/natural-language-mute';
import type * as activities from '../activities';

const identity = { commandId: z.uuid(), ownerProfileId: z.uuid() };
const condition = z.string().trim().min(1);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ ...identity, action: z.literal('CREATE'), condition }),
  z.object({ ...identity, action: z.literal('UPDATE'), ruleId: z.uuid(), condition }),
  z.object({ ...identity, action: z.literal('DELETE'), ruleId: z.uuid() }),
]);
const { executeNaturalLanguageMuteRuleActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function naturalLanguageMuteRuleWorkflow(
  input: NaturalLanguageMuteCommand,
): Promise<NaturalLanguageMuteResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw ApplicationFailure.nonRetryable(
      issue?.message ?? 'Natural Language Mute Rule command is invalid',
      'VALIDATION',
      issue?.path[0],
    );
  }

  const execution = await executeNaturalLanguageMuteRuleActivity(parsed.data);
  if (!execution.ok) {
    throw ApplicationFailure.nonRetryable(execution.error.message, execution.error.code);
  }
  return execution.result;
}
