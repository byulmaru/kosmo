import '@kosmo/core/polyfill';

export { deleteAccountActivity } from './activities/account-deletion';
import { completePostQuoteEffectReceipt } from '@kosmo/core/services';
import {
  sendLocalPostConsentUpdate,
  sendLocalPostQuoteDecision,
  sendLocalPostQuoteRequest,
  sendLocalPostQuoteRevocation,
  sendLocalPostUpdate,
} from '@kosmo/fedify';
export { cleanupUnavailableNotificationsActivity } from './activities/cleanup-unavailable-notifications';
export {
  lookupRemoteActorUriActivity,
  materializeRemoteProfileActorActivity,
  refreshRemoteProfileActorActivity,
} from './activities/remote-profile-materialization';
export {
  sendProfileFollowActivity,
  sendProfileUnfollowActivity,
} from './profile-follow-activities';
export {
  executeProfileFollowPairTransition as executeProfileFollowPairTransitionActivity,
  executeProfileFollowRemoval as executeProfileFollowRemovalActivity,
  loadPendingFollowRequestId as loadPendingFollowRequestIdActivity,
  verifyProfileFollowRemoval as verifyProfileFollowRemovalActivity,
} from '@kosmo/core/services';
export {
  createFollowNotification as createFollowNotificationActivity,
  createFollowRequestNotification as createFollowRequestNotificationActivity,
  deleteFollowNotification as deleteFollowNotificationActivity,
  deleteFollowRequestNotification as deleteFollowRequestNotificationActivity,
} from '@kosmo/core/services';
export { createReplyNotification as createReplyNotificationActivity } from '@kosmo/core/services';
export {
  createReactionNotification as createReactionNotificationActivity,
  deleteReactionNotification as deleteReactionNotificationActivity,
} from '@kosmo/core/services';
export {
  createRepostNotification as createRepostNotificationActivity,
  deleteRepostNotification as deleteRepostNotificationActivity,
} from '@kosmo/core/services';
export {
  sendLocalPostCreate as sendLocalPostCreateActivity,
  sendLocalPostDelete as sendLocalPostDeleteActivity,
  sendLocalPostQuoteRevocations as sendLocalPostQuoteRevocationsActivity,
} from '@kosmo/fedify';

export const sendLocalPostUpdateActivity = async ({
  postId,
  receiptId,
  revision,
}: {
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
}): Promise<void> => {
  await sendLocalPostUpdate({ postId, revision });
  await completePostQuoteEffectReceipt(receiptId);
};

export const sendLocalPostConsentUpdateActivity = async ({
  consentId,
  postId,
  receiptId,
  revision,
}: {
  readonly consentId: string;
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
}): Promise<void> => {
  await sendLocalPostConsentUpdate({ consentId, postId, revision });
  await completePostQuoteEffectReceipt(receiptId);
};

export const sendLocalPostQuoteRequestActivity = async ({
  consentId,
  postId,
  receiptId,
  revision,
}: {
  readonly consentId: string;
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
}): Promise<void> => {
  await sendLocalPostQuoteRequest({ consentId, postId, revision });
  await completePostQuoteEffectReceipt(receiptId);
};

export const sendLocalPostQuoteDecisionActivity = async ({
  consentId,
  receiptId,
  revision,
  sourcePostId,
}: {
  readonly consentId: string;
  readonly receiptId: string;
  readonly revision: number;
  readonly sourcePostId: string;
}): Promise<void> => {
  await sendLocalPostQuoteDecision({ consentId, revision, sourcePostId });
  await completePostQuoteEffectReceipt(receiptId);
};

export const sendLocalPostQuoteRevocationActivity = async ({
  consentId,
  receiptId,
  revision,
  sourcePostId,
}: {
  readonly consentId: string;
  readonly receiptId: string;
  readonly revision: number;
  readonly sourcePostId: string;
}): Promise<void> => {
  await sendLocalPostQuoteRevocation({ consentId, revision, sourcePostId });
  await completePostQuoteEffectReceipt(receiptId);
};
export {
  sendRepostAnnounce as sendRepostAnnounceActivity,
  sendRepostUndo as sendRepostUndoActivity,
} from '@kosmo/fedify';
export {
  sendReaction as sendReactionActivity,
  sendReactionUndo as sendReactionUndoActivity,
} from '@kosmo/fedify';
export { sendLocalProfileUpdate as sendLocalProfileUpdateActivity } from '@kosmo/fedify';
