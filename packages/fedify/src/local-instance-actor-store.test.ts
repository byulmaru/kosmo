import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { exportJwk, generateCryptoKeyPair } from '@fedify/fedify';
import { db, firstOrThrow, Instances, pg, withPrimaryDatabase } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { eq } from 'drizzle-orm';
import { ensureDrizzleLocalInstanceActorKeyPair } from './local-instance-actor-store';

after(async () => pg.end());

const createInstance = async (kind: InstanceKind) =>
  db
    .insert(Instances)
    .values({
      domain: `${randomUUID()}.example`,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const storedKeyPair = (instanceId: string) =>
  db
    .select({
      publicKeyJwk: Instances.activityPubPublicKeyJwk,
      privateKeyJwk: Instances.activityPubPrivateKeyJwk,
    })
    .from(Instances)
    .where(eq(Instances.id, instanceId))
    .then(firstOrThrow);

test('persists and reloads one matching RSA key pair for a local Instance', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const first = await ensureDrizzleLocalInstanceActorKeyPair(instance.id);
  const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));
  const loaded = await ensureDrizzleLocalInstanceActorKeyPair(instance.id);
  const data = new TextEncoder().encode('server actor key pair test');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', first.privateKey, data);

  assert.deepEqual(stored.publicKeyJwk, await exportJwk(first.publicKey));
  assert.deepEqual(stored.privateKeyJwk, await exportJwk(first.privateKey));
  assert.deepEqual(await exportJwk(loaded.publicKey), stored.publicKeyJwk);
  assert.deepEqual(await exportJwk(loaded.privateKey), stored.privateKeyJwk);
  assert.equal(
    await crypto.subtle.verify('RSASSA-PKCS1-v1_5', loaded.publicKey, signature, data),
    true,
  );
});

test('concurrent ensure calls return the pair committed by the atomic winner', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const keyPairs = await Promise.all(
    Array.from({ length: 4 }, () => ensureDrizzleLocalInstanceActorKeyPair(instance.id)),
  );
  const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));

  for (const keyPair of keyPairs) {
    assert.deepEqual(await exportJwk(keyPair.publicKey), stored.publicKeyJwk);
    assert.deepEqual(await exportJwk(keyPair.privateKey), stored.privateKeyJwk);
  }
});

test('PostgreSQL rejects one-sided Instance actor key writes', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const partialWrites = [
    () =>
      db
        .update(Instances)
        .set({ activityPubPublicKeyJwk: { kty: 'RSA' } })
        .where(eq(Instances.id, instance.id)),
    () =>
      db
        .update(Instances)
        .set({ activityPubPrivateKeyJwk: { kty: 'RSA' } })
        .where(eq(Instances.id, instance.id)),
  ];

  for (const write of partialWrites) {
    await assert.rejects(write(), (error: unknown) => {
      const postgresError = (error as { cause?: { code?: string; constraint_name?: string } })
        .cause;
      return (
        postgresError?.code === '23514' &&
        postgresError.constraint_name === 'instance_activitypub_key_pair_null_together'
      );
    });

    const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));
    assert.equal(stored.publicKeyJwk, null);
    assert.equal(stored.privateKeyJwk, null);
  }
});

test('rejects missing or remote Instances without creating key material', async () => {
  const remote = await createInstance(InstanceKind.ACTIVITYPUB);

  await assert.rejects(ensureDrizzleLocalInstanceActorKeyPair(randomUUID()), NotFoundError);
  await assert.rejects(ensureDrizzleLocalInstanceActorKeyPair(remote.id), NotFoundError);

  const stored = await withPrimaryDatabase(() => storedKeyPair(remote.id));
  assert.equal(stored.publicKeyJwk, null);
  assert.equal(stored.privateKeyJwk, null);
});

test('rejects malformed stored keys and leaves them unchanged', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const malformedKey = { kty: 'invalid' };
  await db
    .update(Instances)
    .set({
      activityPubPublicKeyJwk: malformedKey,
      activityPubPrivateKeyJwk: malformedKey,
    })
    .where(eq(Instances.id, instance.id));

  await assert.rejects(
    ensureDrizzleLocalInstanceActorKeyPair(instance.id),
    /invalid ActivityPub signing key pair/u,
  );

  const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));
  assert.deepEqual(stored.publicKeyJwk, malformedKey);
  assert.deepEqual(stored.privateKeyJwk, malformedKey);
});

test('rejects a public and private key from different RSA pairs', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const publicPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const privatePair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  await db
    .update(Instances)
    .set({
      activityPubPublicKeyJwk: (await exportJwk(publicPair.publicKey)) as Record<string, unknown>,
      activityPubPrivateKeyJwk: (await exportJwk(privatePair.privateKey)) as Record<
        string,
        unknown
      >,
    })
    .where(eq(Instances.id, instance.id));

  await assert.rejects(
    ensureDrizzleLocalInstanceActorKeyPair(instance.id),
    /invalid ActivityPub signing key pair/u,
  );
});

test('rejects a non-RSA key pair stored on a local Instance', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const keyPair = await generateCryptoKeyPair('Ed25519');
  await db
    .update(Instances)
    .set({
      activityPubPublicKeyJwk: (await exportJwk(keyPair.publicKey)) as Record<string, unknown>,
      activityPubPrivateKeyJwk: (await exportJwk(keyPair.privateKey)) as Record<string, unknown>,
    })
    .where(eq(Instances.id, instance.id));

  await assert.rejects(
    ensureDrizzleLocalInstanceActorKeyPair(instance.id),
    /invalid ActivityPub signing key pair/u,
  );
});
