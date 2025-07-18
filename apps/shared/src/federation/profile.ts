import {
  getActorHandle,
  type Application,
  type Group,
  type Organization,
  type Person,
  type Service,
} from '@fedify/fedify';
import type { Transaction } from '../db';
import { db as database, firstOrThrow, Profiles } from '../db';

type Actor = Application | Group | Organization | Person | Service;

type GetOrCreateProfileParams = {
  actor: Actor;
  tx?: Transaction;
};
export const getOrCreateProfile = async ({ actor, tx }: GetOrCreateProfileParams) => {
  const db = tx ?? database;

  const profileData = {
    handle: await getActorHandle(actor, { trimLeadingAt: true }),
    inboxUri: actor.inboxId!.href,
    sharedInboxUri: actor.endpoints?.sharedInbox?.href,
    displayName: actor.name?.toString(),
    url: actor.url?.href?.toString(),
  };

  const profile = await db
    .insert(Profiles)
    .values({
      uri: actor.id!.href,
      ...profileData,
    })
    .onConflictDoUpdate({
      target: [Profiles.uri],
      set: profileData,
    })
    .returning()
    .then(firstOrThrow);

  return profile;
};
