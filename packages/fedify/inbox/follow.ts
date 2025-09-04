import { Accept, Follow } from '@fedify/fedify';
import { db, first, ProfileFollowRequests, ProfileFollows, Profiles } from '@kosmo/db';
import { ProfileFollowAcceptMode } from '@kosmo/enum';
import { eq, sql } from 'drizzle-orm';
import { match } from 'ts-pattern';
import { getOrCreateProfileId } from '../profile';
import type { InboxListener } from '@fedify/fedify';
import type { FederationContextData } from '../type';

export const followListener: InboxListener<FederationContextData, Follow> = async (ctx, follow) => {
  const object = ctx.parseUri(follow.objectId);
  if (object === null || object.type !== 'actor') {
    return;
  }

  const follower = await follow.getActor();
  if (follower === null || follower.id === null || follower.inboxId === null) {
    return;
  }

  const targetProfile = await db
    .select({
      id: Profiles.id,
      followAcceptMode: Profiles.followAcceptMode,
    })
    .from(Profiles)
    .where(eq(Profiles.id, object.identifier))
    .then(first);

  if (targetProfile === undefined) {
    return;
  }

  await db.transaction(async (tx) => {
    const actorProfileId = await getOrCreateProfileId({ actor: follower, tx });

    await match(targetProfile.followAcceptMode)
      .with(ProfileFollowAcceptMode.AUTO, async () => {
        const profileFollow = await tx
          .insert(ProfileFollows)
          .values({
            profileId: actorProfileId,
            targetProfileId: targetProfile.id,
          })
          .onConflictDoNothing()
          .returning({
            profileId: ProfileFollows.profileId,
            targetProfileId: ProfileFollows.targetProfileId,
          })
          .then(first);

        if (profileFollow) {
          await Promise.all([
            tx
              .update(Profiles)
              .set({ followerCount: sql`${Profiles.followerCount} + 1` })
              .where(eq(Profiles.id, profileFollow.targetProfileId)),
            tx
              .update(Profiles)
              .set({ followingCount: sql`${Profiles.followingCount} + 1` })
              .where(eq(Profiles.id, profileFollow.profileId)),
          ]);
        }

        await ctx.sendActivity(
          object,
          follower,
          new Accept({
            actor: follow.objectId,
            to: follow.actorId,
            object: follow,
          }),
        );
      })
      .with(ProfileFollowAcceptMode.MANUAL, async () => {
        await tx
          .insert(ProfileFollowRequests)
          .values({
            profileId: actorProfileId,
            targetProfileId: targetProfile.id,
          })
          .onConflictDoNothing();
      })
      .exhaustive();
  });
};
