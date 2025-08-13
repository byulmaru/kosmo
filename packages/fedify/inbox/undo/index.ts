import { Follow, Undo } from '@fedify/fedify';
import { undoFollowListener } from './follow';
import type { InboxListener } from '@fedify/fedify';
import type { FederationContextData } from '../../type';

export const undoListener: InboxListener<FederationContextData, Undo> = async (ctx, undo) => {
  const object = await undo.getObject();

  if (object instanceof Follow) {
    await undoFollowListener(ctx, undo, object);
  }
};
