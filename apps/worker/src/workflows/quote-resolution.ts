import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type ActivityPubQuoteResolutionInput = {
  readonly postId: string;
  readonly revision: number;
};

const { resolveActivityPubQuoteActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function activitypubQuoteResolutionWorkflow(
  input: ActivityPubQuoteResolutionInput,
): Promise<void> {
  if (!input.postId || !Number.isInteger(input.revision) || input.revision < 1) {
    return;
  }
  await resolveActivityPubQuoteActivity(input);
}
