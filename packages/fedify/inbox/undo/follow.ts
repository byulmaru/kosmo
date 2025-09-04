import { db, first, ProfileActivityPubActors, ProfileFollows, Profiles } from '@kosmo/db';
import { and, eq, sql } from 'drizzle-orm';
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
    const deletedFollow = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(
            ProfileFollows.profileId,
            tx
              .select({ profileId: ProfileActivityPubActors.profileId })
              .from(ProfileActivityPubActors)
              .where(eq(ProfileActivityPubActors.uri, actorId.href)),
          ),
          eq(ProfileFollows.targetProfileId, object.identifier),
        ),
      )
      .returning({
        profileId: ProfileFollows.profileId,
        targetProfileId: ProfileFollows.targetProfileId,
      })
      .then(first);

    if (deletedFollow) {
      await Promise.all([
        tx
          .update(Profiles)
          .set({ followerCount: sql`${Profiles.followerCount} - 1` })
          .where(eq(Profiles.id, deletedFollow.targetProfileId)),
        tx
          .update(Profiles)
          .set({ followingCount: sql`${Profiles.followingCount} - 1` })
          .where(eq(Profiles.id, deletedFollow.profileId)),
      ]);
    }
  });
};
