import { Accept, Follow } from '@fedify/fedify';
import { db, first, ProfileFollows, Profiles } from '@kosmo/db';
import { eq } from 'drizzle-orm';
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
    const followerProfileId = await getOrCreateProfileId({ actor: follower, tx });
    await tx
      .insert(ProfileFollows)
      .values({
        followerProfileId,
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
