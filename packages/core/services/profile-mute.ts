import { and, eq, ne } from 'drizzle-orm';
import { db, first, Instances, ProfileMutes, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import type { Transaction } from '../db';

type ProfileMuteInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
};

const ensureOwner = async (tx: Transaction, id: string) => {
  const owner = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, id),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    )
    .limit(1)
    .then(first);

  if (!owner) {
    throw new NotFoundError('Profile not found');
  }
};

const ensureTarget = async (tx: Transaction, id: string) => {
  const target = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .where(eq(Profiles.id, id))
    .limit(1)
    .then(first);

  if (!target) {
    throw new NotFoundError('Profile not found');
  }
};

export const muteProfile = async ({ ownerProfileId, targetProfileId }: ProfileMuteInput) => {
  if (ownerProfileId === targetProfileId) {
    throw new ConflictError({ message: 'Profile cannot mute itself' });
  }

  return db.transaction(async (tx) => {
    await ensureOwner(tx, ownerProfileId);
    await ensureTarget(tx, targetProfileId);

    const inserted = await tx
      .insert(ProfileMutes)
      .values({ ownerProfileId, targetProfileId, expiresAt: null })
      .onConflictDoNothing({
        target: [ProfileMutes.ownerProfileId, ProfileMutes.targetProfileId],
      })
      .returning()
      .then(first);

    const profileMute =
      inserted ??
      (await tx
        .select()
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, ownerProfileId),
            eq(ProfileMutes.targetProfileId, targetProfileId),
          ),
        )
        .limit(1)
        .then(first));

    if (!profileMute) {
      throw new Error('Profile Mute not found after insert conflict');
    }

    return profileMute;
  });
};

export const unmuteProfile = async ({ ownerProfileId, targetProfileId }: ProfileMuteInput) =>
  db.transaction(async (tx) => {
    await ensureOwner(tx, ownerProfileId);

    return tx
      .delete(ProfileMutes)
      .where(
        and(
          eq(ProfileMutes.ownerProfileId, ownerProfileId),
          eq(ProfileMutes.targetProfileId, targetProfileId),
        ),
      )
      .returning()
      .then(first)
      .then((profileMute) => profileMute ?? null);
  });
