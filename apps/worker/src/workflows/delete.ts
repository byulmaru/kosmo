import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { deletePostRelatedNotificationsActivity, sendLocalPostDeleteActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postDeleteWorkflow({ postId, origin }: PostDeleteInput): Promise<void> {
  await settleEffects([
    ...(patched('post-delete-related-notifications-v1')
      ? [deletePostRelatedNotificationsActivity(postId)]
      : []),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostDeleteActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
