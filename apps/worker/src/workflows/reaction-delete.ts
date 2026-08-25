import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type ReactionDeleteEffectsInput = {
  readonly id: string;
  readonly profileId: string;
  readonly postId: string;
  readonly type: string;
  readonly createdAt: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { deleteReactionNotificationActivity, sendReactionUndoActivity } = proxyActivities<
  Pick<typeof activities, 'deleteReactionNotificationActivity' | 'sendReactionUndoActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function reactionDeleteEffectsWorkflow({
  id,
  profileId,
  postId,
  type,
  createdAt,
  origin,
}: ReactionDeleteEffectsInput): Promise<void> {
  await settleEffects([
    deleteReactionNotificationActivity(id),
    ...match(origin)
      .with('LOCAL', () => [sendReactionUndoActivity({ id, profileId, postId, type, createdAt })])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
