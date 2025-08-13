import { db, ProfileActivityPubActors, ProfileFollows } from '@kosmo/db';
import { and, eq } from 'drizzle-orm';
import type { Follow } from '@fedify/fedify';
import type { InboxUndoListener } from '../../type';

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
            tx
              .select({ id: ProfileActivityPubActors.id })
              .from(ProfileActivityPubActors)
              .where(eq(ProfileActivityPubActors.uri, actorId.href)),
          ),
          eq(ProfileFollows.followingProfileId, object.identifier),
        ),
      );
  });
};
