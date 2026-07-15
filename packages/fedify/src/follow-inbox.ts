import { Accept, Follow, Reject, Undo } from '@fedify/vocab';
import type { Federation, InboxContext } from '@fedify/fedify';

type FollowInboxHandler<TActivity extends Follow | Undo | Accept | Reject> = (
  context: InboxContext<void>,
  activity: TActivity,
) => void | Promise<void>;

export interface FollowInboxHandlers {
  readonly onAccept: FollowInboxHandler<Accept>;
  readonly onFollow: FollowInboxHandler<Follow>;
  readonly onReject: FollowInboxHandler<Reject>;
  readonly onUndo: FollowInboxHandler<Undo>;
}

export const unhandledFollowInboxHandlers: FollowInboxHandlers = {
  onAccept: throwUnhandledFollowInboxActivity,
  onFollow: throwUnhandledFollowInboxActivity,
  onReject: throwUnhandledFollowInboxActivity,
  onUndo: throwUnhandledFollowInboxActivity,
};

function throwUnhandledFollowInboxActivity(): never {
  throw new Error('ActivityPub follow inbox handler is not implemented.');
}

export const registerFollowInboxListeners = (
  federation: Federation<void>,
  handlers: FollowInboxHandlers,
): void => {
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Follow, handlers.onFollow)
    .on(Undo, handlers.onUndo)
    .on(Accept, handlers.onAccept)
    .on(Reject, handlers.onReject);
};
