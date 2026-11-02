import { exportJwk, generateCryptoKeyPair, importJwk } from '@fedify/fedify';
import { db, first, Instances, withPrimaryDatabase } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, isNull } from 'drizzle-orm';

type JsonWebKeyRecord = Record<string, unknown>;

const findInstance = async (instanceId: string) =>
  db
    .select({
      kind: Instances.kind,
      keyPairs: Instances.activityPubKeyPairs,
    })
    .from(Instances)
    .where(eq(Instances.id, instanceId))
    .limit(1)
    .then(first);

const isJwkRecord = (value: unknown): value is JsonWebKeyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidStoredKeySet = () =>
  new Error('Local Instance has an invalid ActivityPub signing key set.');

const importStoredKeyPair = async (
  publicKeyJwk: unknown,
  privateKeyJwk: unknown,
): Promise<CryptoKeyPair> => {
  if (!isJwkRecord(publicKeyJwk) || !isJwkRecord(privateKeyJwk)) {
    throw invalidStoredKeySet();
  }

  try {
    const [privateKey, publicKey] = await Promise.all([
      importJwk(privateKeyJwk as JsonWebKey, 'private'),
      importJwk(publicKeyJwk as JsonWebKey, 'public'),
    ]);
    return { privateKey, publicKey };
  } catch {
    throw invalidStoredKeySet();
  }
};

const loadStoredKeyPairs = async (instanceId: string) => {
  const stored = await findInstance(instanceId);

  if (!stored || stored.kind !== InstanceKind.LOCAL) {
    throw new NotFoundError('Local Instance not found');
  }

  if (stored.keyPairs === null) {
    return undefined;
  }

  if (!Array.isArray(stored.keyPairs) || stored.keyPairs.length === 0) {
    throw invalidStoredKeySet();
  }

  return Promise.all(
    stored.keyPairs.map((keyPair) =>
      importStoredKeyPair(keyPair?.publicKeyJwk, keyPair?.privateKeyJwk),
    ),
  );
};

export const ensureDrizzleLocalInstanceActorKeyPairs = async (
  instanceId: string,
): Promise<CryptoKeyPair[]> =>
  withPrimaryDatabase(async () => {
    const existingKeyPairs = await loadStoredKeyPairs(instanceId);

    if (existingKeyPairs) {
      return existingKeyPairs;
    }

    const keyPairs = await Promise.all(
      (['RSASSA-PKCS1-v1_5', 'Ed25519'] as const).map(async (algorithm) => {
        const keyPair = await generateCryptoKeyPair(algorithm);
        const [publicKeyJwk, privateKeyJwk] = await Promise.all([
          exportJwk(keyPair.publicKey),
          exportJwk(keyPair.privateKey),
        ]);
        return {
          keyPair,
          record: {
            publicKeyJwk: publicKeyJwk as JsonWebKeyRecord,
            privateKeyJwk: privateKeyJwk as JsonWebKeyRecord,
          },
        };
      }),
    );
    const inserted = await db
      .update(Instances)
      .set({ activityPubKeyPairs: keyPairs.map(({ record }) => record) })
      .where(
        and(
          eq(Instances.id, instanceId),
          eq(Instances.kind, InstanceKind.LOCAL),
          isNull(Instances.activityPubKeyPairs),
        ),
      )
      .returning({ id: Instances.id });

    if (inserted.length > 0) {
      return keyPairs.map(({ keyPair }) => keyPair);
    }

    const winner = await loadStoredKeyPairs(instanceId);

    if (!winner) {
      throw new Error('Unable to persist Local Instance ActivityPub signing key set.');
    }

    return winner;
  });
