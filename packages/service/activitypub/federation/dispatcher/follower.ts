import { db, first, firstOrThrow, Instances, ProfileFollows, Profiles } from '@kosmo/db';
import { ProfileProtocol, ProfileRelationVisibility, ProfileState } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { CollectionCounter, CollectionDispatcher, Context, Recipient } from '@fedify/fedify';
import type { FederationContextData } from '../type';

export const followerDispatcher: CollectionDispatcher<
  Recipient,
  Context<FederationContextData>,
  null,
  URL
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

  const followers = await db
    .select({
      id: Profiles.id,
      uri: Profiles.uri,
      inboxUrl: Profiles.inboxUrl,
      sharedInboxUrl: Profiles.sharedInboxUrl,
      webDomain: Instances.webDomain,
    })
    .from(ProfileFollows)
    .innerJoin(
      Profiles,
      and(eq(ProfileFollows.profileId, Profiles.id), eq(Profiles.state, ProfileState.ACTIVE)),
    )
    .innerJoin(Instances, and(eq(Profiles.instanceId, Instances.id)))
    .where(
      and(
        eq(ProfileFollows.targetProfileId, identifier),
        or(eq(Profiles.protocol, ProfileProtocol.ACTIVITYPUB), isNull(Profiles.protocol)),
      ),
    )
    .orderBy(desc(ProfileFollows.createdAt));

  return {
    items: followers.map((follower) => ({
      id: follower.uri ? new URL(follower.uri) : ProfileManager.getUri(follower.id, ctx.origin),
      inboxId: follower.inboxUrl
        ? new URL(follower.inboxUrl)
        : ProfileManager.getInboxUrl(follower.id, follower.webDomain!),
      endpoints: {
        sharedInbox: follower.sharedInboxUrl
          ? new URL(follower.sharedInboxUrl)
          : ProfileManager.getSharedInboxUrl(follower.webDomain!),
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
