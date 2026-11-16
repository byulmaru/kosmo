import { withPrimaryDatabase } from '@kosmo/core/db';
import {
  sendLocalPostCreate as sendLocalPostCreateSource,
  sendLocalPostDelete as sendLocalPostDeleteSource,
  sendLocalProfileUpdate as sendLocalProfileUpdateSource,
  sendProfileBlock as sendProfileBlockSource,
  sendProfileBlockUndo as sendProfileBlockUndoSource,
  sendReaction as sendReactionSource,
  sendReactionUndo as sendReactionUndoSource,
  sendRepostAnnounce as sendRepostAnnounceSource,
  sendRepostUndo as sendRepostUndoSource,
} from '@kosmo/fedify';

export const sendLocalPostCreateActivity = (
  ...args: Parameters<typeof sendLocalPostCreateSource>
): ReturnType<typeof sendLocalPostCreateSource> =>
  withPrimaryDatabase(() => sendLocalPostCreateSource(...args));

export const sendLocalPostDeleteActivity = (
  ...args: Parameters<typeof sendLocalPostDeleteSource>
): ReturnType<typeof sendLocalPostDeleteSource> =>
  withPrimaryDatabase(() => sendLocalPostDeleteSource(...args));

export const sendLocalProfileUpdateActivity = (
  ...args: Parameters<typeof sendLocalProfileUpdateSource>
): ReturnType<typeof sendLocalProfileUpdateSource> =>
  withPrimaryDatabase(() => sendLocalProfileUpdateSource(...args));

export const sendReactionActivity = (
  ...args: Parameters<typeof sendReactionSource>
): ReturnType<typeof sendReactionSource> => withPrimaryDatabase(() => sendReactionSource(...args));

export const sendReactionUndoActivity = (
  ...args: Parameters<typeof sendReactionUndoSource>
): ReturnType<typeof sendReactionUndoSource> =>
  withPrimaryDatabase(() => sendReactionUndoSource(...args));

export const sendProfileBlockActivity = (
  ...args: Parameters<typeof sendProfileBlockSource>
): ReturnType<typeof sendProfileBlockSource> =>
  withPrimaryDatabase(() => sendProfileBlockSource(...args));

export const sendProfileBlockUndoActivity = (
  ...args: Parameters<typeof sendProfileBlockUndoSource>
): ReturnType<typeof sendProfileBlockUndoSource> =>
  withPrimaryDatabase(() => sendProfileBlockUndoSource(...args));

export const sendRepostAnnounceActivity = (
  ...args: Parameters<typeof sendRepostAnnounceSource>
): ReturnType<typeof sendRepostAnnounceSource> =>
  withPrimaryDatabase(() => sendRepostAnnounceSource(...args));

export const sendRepostUndoActivity = (
  ...args: Parameters<typeof sendRepostUndoSource>
): ReturnType<typeof sendRepostUndoSource> =>
  withPrimaryDatabase(() => sendRepostUndoSource(...args));
