import { proxyActivities } from '@temporalio/workflow';
import type { PostDeleteInput } from '@kosmo/core/temporal/post-delete';
import type * as activities from '../activities';

const { sendLocalPostDeleteActivity } = proxyActivities<
  Pick<typeof activities, 'sendLocalPostDeleteActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function postDeleteWorkflow({ postId, origin }: PostDeleteInput): Promise<void> {
  if (origin === 'LOCAL') {
    await sendLocalPostDeleteActivity(postId);
  }
}
