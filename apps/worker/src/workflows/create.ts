import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostCreateEffectsInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createReplyNotificationActivity, sendLocalPostCreateActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  await settleEffects([
    createReplyNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostCreateActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
