import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostCreateEffectsInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createReplyNotificationActivity, sendLocalPostCreateActivity } = proxyActivities<
  Pick<typeof activities, 'createReplyNotificationActivity' | 'sendLocalPostCreateActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  const notification = createReplyNotificationActivity(postId);
  await match(origin)
    .with('LOCAL', () => settleEffects([notification, sendLocalPostCreateActivity(postId)]))
    .with('ACTIVITYPUB', () => notification)
    .exhaustive();
}
