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
  const notification = createRepostNotificationActivity(postId);
  await match(origin)
    .with('LOCAL', () => settleEffects([notification, sendRepostAnnounceActivity(postId)]))
    .with('ACTIVITYPUB', () => notification)
    .exhaustive();
}
