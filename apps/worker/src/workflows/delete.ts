import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { sendLocalPostDeleteActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postDeleteWorkflow({ postId, origin }: PostDeleteInput): Promise<void> {
  if (origin === 'LOCAL') {
    await sendLocalPostDeleteActivity(postId);
  }
}
