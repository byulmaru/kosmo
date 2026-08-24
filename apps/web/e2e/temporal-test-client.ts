import { NotificationKind } from '@kosmo/core/enums';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  createFollowNotification,
  createFollowRequestNotification,
  deleteNotificationBySource,
} from '../../../packages/core/services/notification';

type FollowEffectInput = {
  readonly sourceId: string;
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
};

const isFollowEffectInput = (value: unknown): value is FollowEffectInput => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const input = value as Partial<FollowEffectInput>;
  return (
    typeof input.sourceId === 'string' &&
    (input.sourceKind === 'FOLLOW' || input.sourceKind === 'FOLLOW_REQUEST')
  );
};

/**
 * Web E2E has no Temporal Worker. Apply the notification projection directly
 * after the service commits its Follow transition, which is the only
 * workflow effect these tests observe.
 */
const applyFollowNotificationProjection = async (
  workflowType: string,
  input: unknown,
): Promise<void> => {
  if (!isFollowEffectInput(input)) {
    return;
  }

  if (workflowType === 'profileFollowCreateEffectsWorkflow') {
    await (input.sourceKind === 'FOLLOW'
      ? createFollowNotification(input.sourceId)
      : createFollowRequestNotification(input.sourceId));
    return;
  }

  if (workflowType === 'profileFollowDeleteEffectsWorkflow') {
    await deleteNotificationBySource(
      input.sourceKind === 'FOLLOW' ? NotificationKind.FOLLOW : NotificationKind.FOLLOW_REQUEST,
      input.sourceId,
    );
  }
};

temporalClient.workflow.start = (async (workflowType, options) => {
  await applyFollowNotificationProjection(workflowType as string, options.args?.[0]);
  return undefined as never;
}) as typeof temporalClient.workflow.start;
