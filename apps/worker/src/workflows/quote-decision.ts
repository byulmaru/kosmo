import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostQuoteDecisionEffectsInput = {
  readonly consentId: string;
  readonly receiptId: string;
  readonly revision: number;
  readonly sourcePostId: string;
};

const { sendLocalPostQuoteDecisionActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteDecisionEffectsWorkflow({
  consentId,
  receiptId,
  revision,
  sourcePostId,
}: PostQuoteDecisionEffectsInput): Promise<void> {
  await sendLocalPostQuoteDecisionActivity({
    consentId,
    receiptId,
    revision,
    sourcePostId,
  });
}
