import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from '../workflows/activity-options';
import { settleEffects } from '../workflows/settle-effects';
import type * as activities from '../activities';

const { createReplyNotificationActivity, sendLocalPostCreateActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

// Pre-PROD-926 command order, used to generate real legacy histories for replay.
export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
}): Promise<void> {
  await settleEffects([
    createReplyNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostCreateActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
