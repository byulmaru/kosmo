import { exportJwk, generateCryptoKeyPair, importJwk } from '@fedify/fedify';
import { ActivityPubActorKeyKind } from '@kosmo/core/enums';
import type { ActivityPubActorKeyKind as ActivityPubActorKeyKindValue } from '@kosmo/core/enums';
import type { LocalProfileActorProfile } from './local-profile-actor';

export type { LocalProfileActorProfile } from './local-profile-actor';

export type JsonWebKeyRecord = Record<string, unknown>;

export interface StoredLocalActorRow {
  readonly id: string;
  readonly profileId: string;
  readonly uri: string;
}

export interface StoredLocalActorKey {
  readonly id: string;
  readonly activityPubActorId: string;
  readonly kind: ActivityPubActorKeyKindValue;
  readonly privateKeyJwk: JsonWebKeyRecord | null;
  readonly publicKeyJwk: JsonWebKeyRecord;
}

export interface CreateLocalActorRowInput {
  readonly profileId: string;
  readonly uri: string;
}

export interface CreateLocalActorKeyInput {
  readonly activityPubActorId: string;
  readonly kind: ActivityPubActorKeyKindValue;
  readonly privateKeyJwk: JsonWebKeyRecord;
  readonly publicKeyJwk: JsonWebKeyRecord;
}

export interface LocalActorStore {
  findActiveLocalProfile(input: {
    localInstanceId: string;
    profileId: string;
  }): Promise<LocalProfileActorProfile | undefined>;
  findActorByProfileId(profileId: string): Promise<StoredLocalActorRow | undefined>;
  createActor(input: CreateLocalActorRowInput): Promise<StoredLocalActorRow>;
  findActorKeys(activityPubActorId: string): Promise<StoredLocalActorKey[]>;
  createActorKey(input: CreateLocalActorKeyInput): Promise<StoredLocalActorKey>;
}

export interface EnsureLocalActorKeyPairsOptions {
  readonly actorUri: URL;
  readonly localInstanceId: string;
  readonly profileId: string;
  readonly store: LocalActorStore;
}

export interface LocalActorKeyPairsResult {
  readonly actor: StoredLocalActorRow;
  readonly keyPairs: readonly CryptoKeyPair[];
  readonly profile: LocalProfileActorProfile;
}

// ActivityPubActorKeyKind is ordered RSA then Ed25519; Fedify uses the first key pair as #main-key.
const keyKinds = Object.values(ActivityPubActorKeyKind);

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isCanonicalUuid = (value: string): boolean => canonicalUuidPattern.test(value);

type GenerateCryptoKeyPairAlgorithm = 'RSASSA-PKCS1-v1_5' | 'Ed25519';

const keyKindAlgorithm = {
  [ActivityPubActorKeyKind.RSA_PKCS1_V1_5]: 'RSASSA-PKCS1-v1_5',
  [ActivityPubActorKeyKind.ED25519]: 'Ed25519',
} satisfies Record<ActivityPubActorKeyKindValue, GenerateCryptoKeyPairAlgorithm>;

const findOrCreateActor = async ({
  actorUri,
  profileId,
  store,
}: {
  actorUri: URL;
  profileId: string;
  store: LocalActorStore;
}) => {
  const existingActor = await store.findActorByProfileId(profileId);

  if (existingActor) {
    return existingActor;
  }

  return store.createActor({
    profileId,
    uri: actorUri.href,
  });
};

const generateStoredKey = async (
  activityPubActorId: string,
  kind: ActivityPubActorKeyKindValue,
  store: LocalActorStore,
) => {
  const keyPair = await generateCryptoKeyPair(keyKindAlgorithm[kind]);

  return store.createActorKey({
    activityPubActorId,
    kind,
    privateKeyJwk: (await exportJwk(keyPair.privateKey)) as JsonWebKeyRecord,
    publicKeyJwk: (await exportJwk(keyPair.publicKey)) as JsonWebKeyRecord,
  });
};

const ensureStoredKey = async (
  activityPubActorId: string,
  kind: ActivityPubActorKeyKindValue,
  storedKeys: readonly StoredLocalActorKey[],
  store: LocalActorStore,
) => {
  const existingKey = storedKeys.find((key) => key.kind === kind);

  if (existingKey) {
    return existingKey;
  }

  return generateStoredKey(activityPubActorId, kind, store);
};

const importStoredKeyPair = async (storedKey: StoredLocalActorKey): Promise<CryptoKeyPair> => {
  if (!storedKey.privateKeyJwk) {
    throw new Error(`Local ActivityPub actor key ${storedKey.id} is missing a private key.`);
  }

  return {
    privateKey: await importJwk(storedKey.privateKeyJwk as JsonWebKey, 'private'),
    publicKey: await importJwk(storedKey.publicKeyJwk as JsonWebKey, 'public'),
  };
};

export const ensureLocalActorKeyPairs = async ({
  actorUri,
  localInstanceId,
  profileId,
  store,
}: EnsureLocalActorKeyPairsOptions): Promise<LocalActorKeyPairsResult | null> => {
  // Route identifiers are public path input; reject non-canonical UUIDs before they reach uuid columns.
  if (!isCanonicalUuid(profileId)) {
    return null;
  }

  const profile = await store.findActiveLocalProfile({ localInstanceId, profileId });

  if (!profile) {
    return null;
  }

  const actor = await findOrCreateActor({ actorUri, profileId, store });
  const existingKeys = await store.findActorKeys(actor.id);
  const storedKeys = [];

  for (const kind of keyKinds) {
    storedKeys.push(await ensureStoredKey(actor.id, kind, existingKeys, store));
  }

  return {
    actor,
    keyPairs: await Promise.all(storedKeys.map(importStoredKeyPair)),
    profile,
  };
};
