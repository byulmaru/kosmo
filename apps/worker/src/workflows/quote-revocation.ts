import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostQuoteRevocationEffectsInput = {
  readonly consentId: string;
  readonly receiptId: string;
  readonly revision: number;
  readonly sourcePostId: string;
};

const { sendLocalPostQuoteRevocationActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteRevocationEffectsWorkflow({
  consentId,
  receiptId,
  revision,
  sourcePostId,
}: PostQuoteRevocationEffectsInput): Promise<void> {
  await sendLocalPostQuoteRevocationActivity({
    consentId,
    receiptId,
    revision,
    sourcePostId,
  });
}
