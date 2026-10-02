import { HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { HashtagMuteCommand, HashtagMuteResult } from '@kosmo/core/temporal/hashtag-mute';
import type * as activities from '../activities';

const identity = { commandId: z.uuid(), ownerProfileId: z.uuid() };
const scopes = z.array(z.enum(HashtagMuteScope)).min(1);
const decision = z.enum(HashtagMuteDecision);
const expiresAt = z.iso.datetime({ offset: true }).nullable();
const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...identity,
    action: z.literal('CREATE'),
    targetHashtagId: z.uuid(),
    scopes,
    decision,
    expiresAt,
  }),
  z.strictObject({
    ...identity,
    action: z.literal('UPDATE'),
    ruleId: z.uuid(),
    scopes: scopes.optional(),
    decision: decision.optional(),
    expiresAt: expiresAt.optional(),
  }),
  z.strictObject({ ...identity, action: z.literal('DELETE'), ruleId: z.uuid() }),
]);
const { executeHashtagMuteRuleActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function hashtagMuteRuleWorkflow(
  input: HashtagMuteCommand,
): Promise<HashtagMuteResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(parsed.error.issues[0].message, 'VALIDATION');
  }
  const execution = await executeHashtagMuteRuleActivity(parsed.data);
  if (!execution.ok) {
    throw ApplicationFailure.nonRetryable(
      execution.error.message,
      execution.error.code,
      execution.error.field,
    );
  }
  return execution.result;
}
