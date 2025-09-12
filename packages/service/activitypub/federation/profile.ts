import { getActorHandle } from '@fedify/fedify';
import { db as database, firstOrThrow, Instances } from '@kosmo/db';
import { InstanceType, ProfileFollowAcceptMode, ProfileProtocol } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
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

  const profile = await ProfileManager.create({
    data: {
      handle,
      displayName: actor.name?.toString(),
      instanceId: instance.id,
      followAcceptMode: actor.manuallyApprovesFollowers
        ? ProfileFollowAcceptMode.MANUAL
        : ProfileFollowAcceptMode.AUTO,
      inboxUrl: actor.inboxId!.href,
      sharedinboxUrl: actor.endpoints?.sharedInbox?.href,
      uri,
      url: actor.url?.href?.toString() ?? uri,
      protocol: ProfileProtocol.ACTIVITYPUB,
    },

    tx,
  });

  return profile.id;
};
