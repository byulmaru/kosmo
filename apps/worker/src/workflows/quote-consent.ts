import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostQuoteConsentEffectsInput = {
  readonly consentId: string;
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
};

const { sendLocalPostConsentUpdateActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteConsentEffectsWorkflow({
  consentId,
  postId,
  receiptId,
  revision,
}: PostQuoteConsentEffectsInput): Promise<void> {
  await sendLocalPostConsentUpdateActivity({ consentId, postId, receiptId, revision });
}
