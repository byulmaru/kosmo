import { Person } from '@fedify/vocab';
import type { ActorKeyPair } from '@fedify/fedify';

export interface LocalProfileActorProfile {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly bio: string | null;
  readonly createdAt: Temporal.Instant;
}

export interface CreateLocalProfilePersonOptions {
  readonly actorUri: URL;
  readonly inboxUri: URL;
  readonly outboxUri: URL;
  readonly profileUri: URL;
  readonly profile: LocalProfileActorProfile;
  readonly keyPairs: readonly ActorKeyPair[];
}

const getPublicKeyAlgorithmName = (keyPair: ActorKeyPair): string =>
  keyPair.publicKey.algorithm.name;

export const createLocalProfilePerson = ({
  actorUri,
  inboxUri,
  keyPairs,
  outboxUri,
  profile,
  profileUri,
}: CreateLocalProfilePersonOptions): Person => {
  const rsaKeyPair = keyPairs.find(
    (keyPair) => getPublicKeyAlgorithmName(keyPair) === 'RSASSA-PKCS1-v1_5',
  );
  const ed25519KeyPairs = keyPairs.filter(
    (keyPair) => getPublicKeyAlgorithmName(keyPair) === 'Ed25519',
  );

  if (rsaKeyPair == null) {
    throw new Error(`Local ActivityPub actor ${profile.id} is missing an RSA key pair.`);
  }

  return new Person({
    id: actorUri,
    preferredUsername: profile.handle,
    name: profile.name,
    summary: profile.bio,
    url: profileUri,
    published: profile.createdAt,
    inbox: inboxUri,
    outbox: outboxUri,
    publicKey: rsaKeyPair.cryptographicKey,
    assertionMethods: ed25519KeyPairs.map((keyPair) => keyPair.multikey),
  });
};
