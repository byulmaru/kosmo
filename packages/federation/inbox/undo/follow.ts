import type { Follow } from '@fedify/fedify';
import type { InboxUndoListener } from '../../type';
import { and, eq } from 'drizzle-orm';
import { db, ProfileFollows, Profiles } from '@kosmo/db';

export const undoFollowListener: InboxUndoListener<Follow> = async (ctx, undo, follow) => {
  if (undo.actorId === null || follow.objectId === null) {
    return;
  }

  const actorId = undo.actorId;
  const object = ctx.parseUri(follow.objectId);
  if (object === null || object.type !== 'actor') {
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(
            ProfileFollows.followerProfileId,
            tx.select({ id: Profiles.id }).from(Profiles).where(eq(Profiles.uri, actorId.href)),
          ),
          eq(ProfileFollows.followingProfileId, object.identifier),
        ),
      );
  });
};
