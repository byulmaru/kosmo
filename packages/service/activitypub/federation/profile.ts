import { getActorHandle } from '@fedify/fedify';
import { dayjs } from '@kosmo/dayjs';
import { db as database, first, firstOrThrow, Instances, Profiles } from '@kosmo/db';
import { InstanceType, ProfileFollowAcceptMode, ProfileProtocol } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { eq } from 'drizzle-orm';
import type { Application, Group, Organization, Person, Service } from '@fedify/fedify';
import type { Transaction } from '@kosmo/db';

type Actor = Application | Group | Organization | Person | Service;

type GetOrCreateProfileParams = {
  actor: Actor;
  tx?: Transaction;
};
export const getOrCreateProfile = async ({ actor, tx }: GetOrCreateProfileParams) => {
  const db = tx ?? database;

  const uri = actor.id!.href;
  let profile = await db.select().from(Profiles).where(eq(Profiles.uri, uri)).then(first);
  if (!profile || !profile.lastFetchedAt?.isAfter(dayjs().subtract(1, 'day'))) {
    const [handle, domain] = (await getActorHandle(actor, { trimLeadingAt: true })).split('@', 2);

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

    profile = await ProfileManager.create({
      tx,
      fetch: true,
      data: {
        handle,
        displayName: actor.name?.toString(),
        instanceId: instance.id,
        followAcceptMode: actor.manuallyApprovesFollowers
          ? ProfileFollowAcceptMode.MANUAL
          : ProfileFollowAcceptMode.AUTO,
        inboxUrl: actor.inboxId!.href,
        sharedInboxUrl: actor.endpoints?.sharedInbox?.href,
        uri,
        url: actor.url?.href?.toString() ?? uri,
        protocol: ProfileProtocol.ACTIVITYPUB,
      },
    });
  }

  return profile;
};
