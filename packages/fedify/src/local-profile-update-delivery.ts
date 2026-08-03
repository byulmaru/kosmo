import { Update } from '@fedify/vocab';
import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import { localOutboundFederation } from './local-outbound-federation';
import { createLocalProfilePerson } from './local-profile-person';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';

export const sendLocalProfileUpdate = async (profileId: string): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, profileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(profileId);
  const projection = await ensureDrizzleLocalProfileActor({
    actorUri,
    localInstanceId: source.localInstanceId,
    profileId,
  });
  if (!projection) {
    return;
  }

  const object = createLocalProfilePerson({
    context,
    keyPairs: await context.getActorKeyPairs(profileId),
    profile: projection.profile,
  });
  const actorPathname = actorUri.pathname.replace(/\/$/, '');
  const activity = new Update({
    actor: actorUri,
    id: new URL(`${actorPathname}/updates/${crypto.randomUUID()}`, actorUri),
    object,
    tos: [context.getFollowersUri(profileId)],
  });

  await dispatchActivityPubActivity({
    activity,
    actorProfileId: profileId,
    context,
    directProfileIds: [],
  });
};
