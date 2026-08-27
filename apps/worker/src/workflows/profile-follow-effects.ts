import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type {
  ProfileFollowCreateEffectInput,
  ProfileFollowDeleteEffectInput,
} from '@kosmo/core/services';
import type * as activities from '../activities';

type FollowEffectActivities = Pick<
  typeof activities,
  | 'createFollowNotificationActivity'
  | 'createFollowRequestNotificationActivity'
  | 'deleteFollowNotificationActivity'
  | 'deleteFollowRequestNotificationActivity'
  | 'sendProfileFollowActivity'
  | 'sendProfileUnfollowActivity'
>;

const {
  createFollowNotificationActivity,
  createFollowRequestNotificationActivity,
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  sendProfileFollowActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<FollowEffectActivities>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export const runProfileFollowCreateEffect = async (
  input: ProfileFollowCreateEffectInput,
): Promise<void> => {
  await settleEffects([
    match(input.sourceKind)
      .with('FOLLOW', () => createFollowNotificationActivity(input.sourceId))
      .with('FOLLOW_REQUEST', () => createFollowRequestNotificationActivity(input.sourceId))
      .exhaustive(),
    ...match(input)
      .with({ sendActivityPub: true }, () => [
        sendProfileFollowActivity({
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
        }),
      ])
      .otherwise(() => []),
  ]);
};

export const runProfileFollowDeleteEffect = async (
  input: ProfileFollowDeleteEffectInput,
): Promise<void> => {
  await settleEffects([
    match(input.sourceKind)
      .with('FOLLOW', () => deleteFollowNotificationActivity(input.sourceId))
      .with('FOLLOW_REQUEST', () => deleteFollowRequestNotificationActivity(input.sourceId))
      .exhaustive(),
    ...match(input)
      .with({ sendActivityPub: true }, () => [sendProfileUnfollowActivity(input)])
      .otherwise(() => []),
  ]);
};
