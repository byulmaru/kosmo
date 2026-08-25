import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type RepostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { deleteRepostNotificationActivity, sendRepostUndoActivity } = proxyActivities<
  Pick<typeof activities, 'deleteRepostNotificationActivity' | 'sendRepostUndoActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function repostDeleteWorkflow({ postId, origin }: RepostDeleteInput): Promise<void> {
  await settleEffects([
    deleteRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostUndoActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
