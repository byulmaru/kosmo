import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostRepostInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createRepostNotificationActivity, sendRepostAnnounceActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postRepostWorkflow({ postId, origin }: PostRepostInput): Promise<void> {
  await settleEffects([
    createRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostAnnounceActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
