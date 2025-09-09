import { getActorHandle } from '@fedify/fedify';
import {
  db as database,
  first,
  firstOrThrow,
  Instances,
  ProfileActivityPubActors,
  Profiles,
} from '@kosmo/db';
import { InstanceType, ProfileFollowAcceptMode } from '@kosmo/enum';
import { eq } from 'drizzle-orm';
import type { Application, Group, Organization, Person, Service } from '@fedify/fedify';
import type { Transaction } from '@kosmo/db';

type Actor = Application | Group | Organization | Person | Service;

type GetOrCreateProfileIdParams = {
  actor: Actor;
  tx?: Transaction;
};
export const getOrCreateProfileId = async ({ actor, tx }: GetOrCreateProfileIdParams) => {
  const db = tx ?? database;

  const [handle, domain] = (await getActorHandle(actor, { trimLeadingAt: true })).split('@', 2);
  const uri = actor.id!.href;

  const instance = await db
    .insert(Instances)
    .values({
      domain,
      type: InstanceType.ACTIVITYPUB,
    })
    .onConflictDoUpdate({
      target: [Instances.domain],
      set: { type: InstanceType.ACTIVITYPUB },
    })
    .returning({ id: Instances.id })
    .then(firstOrThrow);

  const profileData = {
    handle,
    normalizedHandle: handle.toLowerCase(),
    displayName: actor.name?.toString(),
    instanceId: instance.id,
    followAcceptMode: actor.manuallyApprovesFollowers
      ? ProfileFollowAcceptMode.MANUAL
      : ProfileFollowAcceptMode.AUTO,
  };

  const activityPubActorData = {
    inboxUri: actor.inboxId!.href,
    sharedInboxUri: actor.endpoints?.sharedInbox?.href,
    url: actor.url?.href?.toString() ?? uri,
  };

  const activityPubActor = await db
    .select({ id: ProfileActivityPubActors.id, profileId: ProfileActivityPubActors.profileId })
    .from(ProfileActivityPubActors)
    .where(eq(ProfileActivityPubActors.uri, uri))
    .then(first);

  if (activityPubActor) {
    await Promise.all([
      db.update(Profiles).set(profileData).where(eq(Profiles.id, activityPubActor.profileId)),
      db
        .update(ProfileActivityPubActors)
        .set(activityPubActorData)
        .where(eq(ProfileActivityPubActors.id, activityPubActor.id)),
    ]);

    return activityPubActor.profileId;
  } else {
    const profile = await db
      .insert(Profiles)
      .values(profileData)
      .returning({ id: Profiles.id })
      .then(firstOrThrow);
    await db.insert(ProfileActivityPubActors).values({
      uri,
      profileId: profile.id,
      ...activityPubActorData,
    });

    return profile.id;
  }
};
