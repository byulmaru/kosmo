import {
  db,
  first,
  firstOrThrow,
  Instances,
  ProfileActivityPubActors,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { InstanceType, ProfileRelationVisibility, ProfileState } from '@kosmo/enum';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Actor, CollectionCounter, CollectionDispatcher, Context } from '@fedify/fedify';
import type { FederationContextData } from '../type';

export const followingDispatcher: CollectionDispatcher<
  URL | Actor,
  Context<FederationContextData>,
  null,
  void
> = async (ctx, identifier) => {
  const profile = await db
    .select({
      relationVisibility: Profiles.relationVisibility,
    })
    .from(Profiles)
    .where(eq(Profiles.id, identifier))
    .then(firstOrThrow);

  if (profile?.relationVisibility === ProfileRelationVisibility.PRIVATE) {
    return {
      items: [],
    };
  }

  const following = await db
    .select({
      id: Profiles.id,
      uri: ProfileActivityPubActors.uri,
      inboxUri: ProfileActivityPubActors.inboxUri,
      sharedInboxUri: ProfileActivityPubActors.sharedInboxUri,
    })
    .from(ProfileFollows)
    .innerJoin(
      Profiles,
      and(eq(ProfileFollows.targetProfileId, Profiles.id), eq(Profiles.state, ProfileState.ACTIVE)),
    )
    .innerJoin(
      Instances,
      and(
        eq(Profiles.instanceId, Instances.id),
        inArray(Instances.type, [InstanceType.LOCAL, InstanceType.ACTIVITYPUB]),
      ),
    )
    .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
    .where(eq(ProfileFollows.profileId, identifier))
    .orderBy(desc(ProfileFollows.createdAt));

  return {
    items: following.map((follow) =>
      follow.uri ? new URL(follow.uri) : ctx.getActorUri(follow.id),
    ),
  };
};

export const followingCounter: CollectionCounter<FederationContextData, void> = async (
  _,
  identifier,
) => {
  const targetProfile = await db
    .select({
      followingCount: Profiles.followingCount,
    })
    .from(Profiles)
    .where(eq(Profiles.id, identifier))
    .then(first);

  return targetProfile?.followingCount ?? null;
};
