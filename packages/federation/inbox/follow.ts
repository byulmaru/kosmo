import { Accept, Follow, type InboxListener } from '@fedify/fedify';
import { eq } from 'drizzle-orm';
import { db, first, Profiles, ProfileFollows } from '@kosmo/db';
import { getOrCreateProfile } from '../profile';
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

  const followingProfile = await db
    .select({
      id: Profiles.id,
    })
    .from(Profiles)
    .where(eq(Profiles.id, object.identifier))
    .then(first);

  if (followingProfile === undefined) {
    return;
  }

  await db.transaction(async (tx) => {
    const followerProfile = await getOrCreateProfile({ actor: follower, tx });
    await tx
      .insert(ProfileFollows)
      .values({
        followerProfileId: followerProfile.id,
        followingProfileId: followingProfile.id,
      })
      .onConflictDoNothing();
  });

  await ctx.sendActivity(
    object,
    follower,
    new Accept({
      actor: follow.objectId,
      to: follow.actorId,
      object: follow,
    }),
  );
};
