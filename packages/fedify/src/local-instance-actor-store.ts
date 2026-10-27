import { exportJwk, generateCryptoKeyPair, importJwk } from '@fedify/fedify';
import { db, first, Instances, withPrimaryDatabase } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, isNull, sql } from 'drizzle-orm';

type JsonWebKeyRecord = Record<string, unknown>;

const findInstance = async (instanceId: string) =>
  db
    .select({
      kind: Instances.kind,
      publicKeyJwk: Instances.activityPubPublicKeyJwk,
      privateKeyJwk: Instances.activityPubPrivateKeyJwk,
      publicKeyIsSqlNull: sql<boolean>`${Instances.activityPubPublicKeyJwk} IS NULL`,
      privateKeyIsSqlNull: sql<boolean>`${Instances.activityPubPrivateKeyJwk} IS NULL`,
    })
    .from(Instances)
    .where(eq(Instances.id, instanceId))
    .limit(1)
    .then(first);

const isJwkRecord = (value: unknown): value is JsonWebKeyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidStoredKeyPair = () =>
  new Error('Local Instance has an invalid ActivityPub signing key pair.');

const importStoredKeyPair = async (
  publicKeyJwk: unknown,
  privateKeyJwk: unknown,
): Promise<CryptoKeyPair> => {
  if (!isJwkRecord(publicKeyJwk) || !isJwkRecord(privateKeyJwk)) {
    throw invalidStoredKeyPair();
  }

  try {
    const [privateKey, publicKey] = await Promise.all([
      importJwk(privateKeyJwk as JsonWebKey, 'private'),
      importJwk(publicKeyJwk as JsonWebKey, 'public'),
    ]);
    if (
      privateKey.algorithm.name !== 'RSASSA-PKCS1-v1_5' ||
      publicKey.algorithm.name !== 'RSASSA-PKCS1-v1_5'
    ) {
      throw invalidStoredKeyPair();
    }

    return { privateKey, publicKey };
  } catch {
    throw invalidStoredKeyPair();
  }
};

const loadStoredKeyPair = async (instanceId: string) => {
  const stored = await findInstance(instanceId);

  if (!stored || stored.kind !== InstanceKind.LOCAL) {
    throw new NotFoundError('Local Instance not found');
  }

  if (stored.publicKeyIsSqlNull && stored.privateKeyIsSqlNull) {
    return undefined;
  }

  if (
    stored.publicKeyIsSqlNull ||
    stored.privateKeyIsSqlNull ||
    !stored.publicKeyJwk ||
    !stored.privateKeyJwk
  ) {
    throw invalidStoredKeyPair();
  }

  return importStoredKeyPair(stored.publicKeyJwk, stored.privateKeyJwk);
};

export const ensureDrizzleLocalInstanceActorKeyPair = async (
  instanceId: string,
): Promise<CryptoKeyPair> =>
  withPrimaryDatabase(async () => {
    const existingKeyPair = await loadStoredKeyPair(instanceId);

    if (existingKeyPair) {
      return existingKeyPair;
    }

    const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const [publicKeyJwk, privateKeyJwk] = await Promise.all([
      exportJwk(keyPair.publicKey),
      exportJwk(keyPair.privateKey),
    ]);
    const inserted = await db
      .update(Instances)
      .set({
        activityPubPublicKeyJwk: publicKeyJwk as JsonWebKeyRecord,
        activityPubPrivateKeyJwk: privateKeyJwk as JsonWebKeyRecord,
      })
      .where(
        and(
          eq(Instances.id, instanceId),
          eq(Instances.kind, InstanceKind.LOCAL),
          isNull(Instances.activityPubPublicKeyJwk),
          isNull(Instances.activityPubPrivateKeyJwk),
        ),
      )
      .returning({ id: Instances.id });

    if (inserted.length > 0) {
      return keyPair;
    }

    const winner = await loadStoredKeyPair(instanceId);

    if (!winner) {
      throw new Error('Unable to persist Local Instance ActivityPub signing key pair.');
    }

    return winner;
  });
