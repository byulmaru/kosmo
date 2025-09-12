import { ProfileService } from '@kosmo/service';
import { getOrCreateProfileId } from '../../profile';
import type { Follow } from '@fedify/fedify';
import type { InboxUndoListener } from '../../type';

export const undoFollowListener: InboxUndoListener<Follow> = async (ctx, undo, follow) => {
  if (undo.actorId === null || follow.objectId === null) {
    return;
  }

  const object = ctx.parseUri(follow.objectId);
  if (object === null || object.type !== 'actor') {
    return;
  }

  const actor = await undo.getActor();
  if (actor === null || actor.id === null || actor.inboxId === null) {
    return;
  }

  const actorProfileId = await getOrCreateProfileId({ actor });

  await ProfileService.unfollow.call({
    actorProfileId,
    targetProfileId: object.identifier,
  });
};
