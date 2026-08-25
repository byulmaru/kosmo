import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostRepostInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createRepostNotificationActivity, sendRepostAnnounceActivity } = proxyActivities<
  Pick<typeof activities, 'createRepostNotificationActivity' | 'sendRepostAnnounceActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function postRepostWorkflow({ postId, origin }: PostRepostInput): Promise<void> {
  await settleEffects([
    createRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostAnnounceActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
