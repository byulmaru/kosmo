import {
  db,
  first,
  Instances,
  ProfileActivityPubActors,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { InstanceType, ProfileState } from '@kosmo/enum';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CollectionCounter, CollectionDispatcher, Context, Recipient } from '@fedify/fedify';
import type { FederationContextData } from '../type';

export const followerDispatcher: CollectionDispatcher<
  Recipient,
  Context<FederationContextData>,
  null,
  URL
> = async (ctx, identifier) => {
  const followers = await db
    .select({
      id: Profiles.id,
      uri: ProfileActivityPubActors.uri,
      inboxUri: ProfileActivityPubActors.inboxUri,
      sharedInboxUri: ProfileActivityPubActors.sharedInboxUri,
    })
    .from(ProfileFollows)
    .innerJoin(
      Profiles,
      and(eq(ProfileFollows.profileId, Profiles.id), eq(Profiles.state, ProfileState.ACTIVE)),
    )
    .innerJoin(
      Instances,
      and(
        eq(Profiles.instanceId, Instances.id),
        inArray(Instances.type, [InstanceType.LOCAL, InstanceType.ACTIVITYPUB]),
      ),
    )
    .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
    .where(eq(ProfileFollows.targetProfileId, identifier))
    .orderBy(desc(ProfileFollows.createdAt));

  return {
    items: followers.map((follower) => ({
      id: follower.uri ? new URL(follower.uri) : ctx.getActorUri(follower.id),
      inboxId: follower.inboxUri ? new URL(follower.inboxUri) : ctx.getInboxUri(follower.id),
      endpoints: {
        sharedInbox: follower.sharedInboxUri ? new URL(follower.sharedInboxUri) : ctx.getInboxUri(),
      },
    })),
  };
};

export const followerCounter: CollectionCounter<FederationContextData, URL> = async (
  _,
  identifier,
) => {
  const targetProfile = await db
    .select({
      followerCount: Profiles.followerCount,
    })
    .from(Profiles)
    .where(eq(Profiles.id, identifier))
    .then(first);

  return targetProfile?.followerCount ?? null;
};
