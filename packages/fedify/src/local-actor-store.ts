import '@kosmo/core/polyfill';

import { ActivityPubActorKeys, ActivityPubActors, db, first, Profiles } from '@kosmo/core/db';
import { ActivityPubActorType, ProfileState } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import { ensureLocalActorKeyPairs } from './local-actor-keys';
import type { Database } from '@kosmo/core/db';
import type {
  CreateLocalActorKeyInput,
  CreateLocalActorRowInput,
  EnsureLocalActorKeyPairsOptions,
  LocalActorKeyPairsResult,
  LocalActorStore,
  LocalProfileActorProfile,
  StoredLocalActorKey,
  StoredLocalActorRow,
} from './local-actor-keys';

type LocalActorDbClient = Pick<Database, 'insert' | 'select'>;

const toLocalProfileActorProfile = (
  profile: typeof Profiles.$inferSelect,
): LocalProfileActorProfile => ({
  id: profile.id,
  handle: profile.handle,
  name: profile.displayName,
  bio: profile.bio,
  createdAt: profile.createdAt,
});

const findActorByProfileId = async (
  client: LocalActorDbClient,
  profileId: string,
): Promise<StoredLocalActorRow | undefined> =>
  client
    .select()
    .from(ActivityPubActors)
    .where(eq(ActivityPubActors.profileId, profileId))
    .limit(1)
    .then(first);

const findActorKey = async (
  client: LocalActorDbClient,
  input: Pick<CreateLocalActorKeyInput, 'activityPubActorId' | 'kind'>,
): Promise<StoredLocalActorKey | undefined> =>
  client
    .select()
    .from(ActivityPubActorKeys)
    .where(
      and(
        eq(ActivityPubActorKeys.activityPubActorId, input.activityPubActorId),
        eq(ActivityPubActorKeys.kind, input.kind),
      ),
    )
    .limit(1)
    .then(first);

const requireExistingActor = async (
  client: LocalActorDbClient,
  input: CreateLocalActorRowInput,
) => {
  const existingActor = await findActorByProfileId(client, input.profileId);

  if (!existingActor) {
    throw new Error(`Local ActivityPub actor for profile ${input.profileId} was not created.`);
  }

  return existingActor;
};

const requireExistingActorKey = async (
  client: LocalActorDbClient,
  input: CreateLocalActorKeyInput,
) => {
  const existingKey = await findActorKey(client, input);

  if (!existingKey) {
    throw new Error(
      `Local ActivityPub actor key ${input.kind} for actor ${input.activityPubActorId} was not created.`,
    );
  }

  return existingKey;
};

export const createDrizzleLocalActorStore = (client: LocalActorDbClient = db): LocalActorStore => ({
  async findActiveLocalProfile({ localInstanceId, profileId }) {
    const profile = await client
      .select()
      .from(Profiles)
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.instanceId, localInstanceId),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);

    return profile ? toLocalProfileActorProfile(profile) : undefined;
  },

  findActorByProfileId(profileId) {
    return findActorByProfileId(client, profileId);
  },

  async createActor(input: CreateLocalActorRowInput) {
    const insertedActor = await client
      .insert(ActivityPubActors)
      .values({
        profileId: input.profileId,
        uri: input.uri,
        type: ActivityPubActorType.PERSON,
      })
      .onConflictDoNothing({ target: [ActivityPubActors.profileId] })
      .returning()
      .then(first);

    return insertedActor ?? requireExistingActor(client, input);
  },

  findActorKeys(activityPubActorId) {
    return client
      .select()
      .from(ActivityPubActorKeys)
      .where(eq(ActivityPubActorKeys.activityPubActorId, activityPubActorId));
  },

  async createActorKey(input: CreateLocalActorKeyInput) {
    const insertedKey = await client
      .insert(ActivityPubActorKeys)
      .values(input)
      .onConflictDoNothing({
        target: [ActivityPubActorKeys.activityPubActorId, ActivityPubActorKeys.kind],
      })
      .returning()
      .then(first);

    return insertedKey ?? requireExistingActorKey(client, input);
  },
});

export const ensureDrizzleLocalActorKeyPairs = async (
  options: Omit<EnsureLocalActorKeyPairsOptions, 'store'>,
): Promise<LocalActorKeyPairsResult | null> =>
  db.transaction((tx) =>
    ensureLocalActorKeyPairs({
      ...options,
      store: createDrizzleLocalActorStore(tx),
    }),
  );
