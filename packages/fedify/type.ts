import type { InboxContext, Object, Undo } from '@fedify/fedify';

export type FederationContextData = null;
export type InboxUndoListener<T extends Object> = (
  ctx: InboxContext<FederationContextData>,
  undo: Undo,
  object: T,
) => void | Promise<void>;
