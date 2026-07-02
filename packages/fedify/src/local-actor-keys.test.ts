import '@kosmo/core/polyfill';

import { exportJwk } from '@fedify/fedify';
import { ActivityPubActorKeyKind } from '@kosmo/core/enums';
import { describe, expect, it } from 'vitest';
import { ensureLocalActorKeyPairs } from './local-actor-keys';
import type {
  CreateLocalActorKeyInput,
  CreateLocalActorRowInput,
  LocalActorStore,
  LocalProfileActorProfile,
  StoredLocalActorKey,
  StoredLocalActorRow,
} from './local-actor-keys';

class InMemoryLocalActorStore implements LocalActorStore {
  readonly profiles = new Map<string, LocalProfileActorProfile & { localInstanceId: string }>();
  readonly actors: StoredLocalActorRow[] = [];
  readonly keys: StoredLocalActorKey[] = [];

  async findActiveLocalProfile({
    localInstanceId,
    profileId,
  }: {
    localInstanceId: string;
    profileId: string;
  }) {
    const profile = this.profiles.get(profileId);

    if (profile?.localInstanceId !== localInstanceId) {
      return undefined;
    }

    return profile;
  }

  async findActorByProfileId(profileId: string) {
    return this.actors.find((actor) => actor.profileId === profileId);
  }

  async createActor(input: CreateLocalActorRowInput) {
    const actor = {
      id: `actor-${this.actors.length + 1}`,
      profileId: input.profileId,
      uri: input.uri,
    } satisfies StoredLocalActorRow;

    this.actors.push(actor);

    return actor;
  }

  async findActorKeys(activityPubActorId: string) {
    return this.keys.filter((key) => key.activityPubActorId === activityPubActorId);
  }

  async createActorKey(input: CreateLocalActorKeyInput) {
    const key = {
      id: `key-${this.keys.length + 1}`,
      activityPubActorId: input.activityPubActorId,
      kind: input.kind,
      privateKeyJwk: input.privateKeyJwk,
      publicKeyJwk: input.publicKeyJwk,
    } satisfies StoredLocalActorKey;

    this.keys.push(key);

    return key;
  }
}

const profileId = '018f4b7c-1111-7222-8333-944455556666';
const localInstanceId = 'local-instance-1';
const actorUri = new URL(`https://kosmo.test/ap/actor/${profileId}`);

const createStoreWithProfile = () => {
  const store = new InMemoryLocalActorStore();
  store.profiles.set(profileId, {
    id: profileId,
    localInstanceId,
    handle: 'alice',
    name: 'Alice Example',
    bio: null,
    createdAt: Temporal.Instant.from('2026-01-02T03:04:05Z'),
  });

  return store;
};

describe('ensureLocalActorKeyPairs', () => {
  it('returns null without creating rows when the identifier is not an active local profile', async () => {
    const store = new InMemoryLocalActorStore();

    await expect(
      ensureLocalActorKeyPairs({
        actorUri,
        localInstanceId,
        profileId,
        store,
      }),
    ).resolves.toBeNull();
    expect(store.actors).toEqual([]);
    expect(store.keys).toEqual([]);
  });

  it('lazily creates the actor row and RSA/Ed25519 keys in Fedify dispatcher order', async () => {
    const store = createStoreWithProfile();

    const result = await ensureLocalActorKeyPairs({
      actorUri,
      localInstanceId,
      profileId,
      store,
    });

    expect(result?.profile.handle).toBe('alice');
    expect(store.actors).toEqual([
      {
        id: 'actor-1',
        profileId,
        uri: actorUri.href,
      },
    ]);
    expect(store.keys.map((key) => key.kind)).toEqual([
      ActivityPubActorKeyKind.RSA_PKCS1_V1_5,
      ActivityPubActorKeyKind.ED25519,
    ]);
    expect(result?.keyPairs.map((keyPair) => keyPair.publicKey.algorithm.name)).toEqual([
      'RSASSA-PKCS1-v1_5',
      'Ed25519',
    ]);

    expect(await exportJwk(result!.keyPairs[0]!.privateKey)).toEqual(store.keys[0]!.privateKeyJwk);
    expect(await exportJwk(result!.keyPairs[1]!.privateKey)).toEqual(store.keys[1]!.privateKeyJwk);
  });

  it('reuses persisted JWKs on subsequent calls', async () => {
    const store = createStoreWithProfile();
    const first = await ensureLocalActorKeyPairs({
      actorUri,
      localInstanceId,
      profileId,
      store,
    });

    const second = await ensureLocalActorKeyPairs({
      actorUri,
      localInstanceId,
      profileId,
      store,
    });

    expect(store.actors).toHaveLength(1);
    expect(store.keys).toHaveLength(2);
    expect(await exportJwk(second!.keyPairs[0]!.privateKey)).toEqual(
      await exportJwk(first!.keyPairs[0]!.privateKey),
    );
    expect(await exportJwk(second!.keyPairs[1]!.privateKey)).toEqual(
      await exportJwk(first!.keyPairs[1]!.privateKey),
    );
  });
});
