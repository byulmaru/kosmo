import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type RepostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { deleteRepostNotificationActivity, sendRepostUndoActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function repostDeleteWorkflow({ postId, origin }: RepostDeleteInput): Promise<void> {
  await settleEffects([
    deleteRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostUndoActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
