import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { exportJwk } from '@fedify/fedify';
import { db, firstOrThrow, Instances, pg, withPrimaryDatabase } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { eq, sql } from 'drizzle-orm';
import { ensureDrizzleLocalInstanceActorKeyPairs } from './local-instance-actor-store';

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
      keyPairs: Instances.activityPubKeyPairs,
    })
    .from(Instances)
    .where(eq(Instances.id, instanceId))
    .then(firstOrThrow);

test('persists and reloads the ordered RSA and Ed25519 key pairs for a local Instance', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const first = await ensureDrizzleLocalInstanceActorKeyPairs(instance.id);
  const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));
  const loaded = await ensureDrizzleLocalInstanceActorKeyPairs(instance.id);
  const data = new TextEncoder().encode('server actor key pair test');

  assert.equal(first.length, 2);
  assert.deepEqual(
    first.map(({ privateKey }) => privateKey.algorithm.name),
    ['RSASSA-PKCS1-v1_5', 'Ed25519'],
  );
  assert.equal(stored.keyPairs?.length, 2);
  assert.ok(stored.keyPairs);
  for (const [index, keyPair] of first.entries()) {
    const persistedPair: {
      publicKeyJwk: Record<string, unknown>;
      privateKeyJwk: Record<string, unknown>;
    } = stored.keyPairs[index];
    assert.deepEqual(persistedPair.publicKeyJwk, await exportJwk(keyPair.publicKey));
    assert.deepEqual(persistedPair.privateKeyJwk, await exportJwk(keyPair.privateKey));
    assert.deepEqual(await exportJwk(loaded[index].publicKey), persistedPair.publicKeyJwk);
    assert.deepEqual(await exportJwk(loaded[index].privateKey), persistedPair.privateKeyJwk);

    const signature = await crypto.subtle.sign(
      keyPair.privateKey.algorithm.name,
      keyPair.privateKey,
      data,
    );
    assert.equal(
      await crypto.subtle.verify(
        loaded[index].privateKey.algorithm.name,
        loaded[index].publicKey,
        signature,
        data,
      ),
      true,
    );
  }
});

test('concurrent ensure calls return the key set committed by the atomic winner', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const keySets = await Promise.all(
    Array.from({ length: 4 }, () => ensureDrizzleLocalInstanceActorKeyPairs(instance.id)),
  );
  const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));

  for (const keySet of keySets) {
    assert.equal(keySet.length, stored.keyPairs?.length);
    for (const [index, keyPair] of keySet.entries()) {
      assert.deepEqual(await exportJwk(keyPair.publicKey), stored.keyPairs?.[index].publicKeyJwk);
      assert.deepEqual(await exportJwk(keyPair.privateKey), stored.keyPairs?.[index].privateKeyJwk);
    }
  }
});

test('rejects empty and malformed stored key sets without replacing them', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  const malformedKeySet = [{ publicKeyJwk: { kty: 'invalid' }, privateKeyJwk: { kty: 'invalid' } }];
  const invalidKeySets = [[], malformedKeySet];

  for (const keyPairs of invalidKeySets) {
    await db
      .update(Instances)
      .set({ activityPubKeyPairs: keyPairs })
      .where(eq(Instances.id, instance.id));
    await assert.rejects(
      ensureDrizzleLocalInstanceActorKeyPairs(instance.id),
      /invalid ActivityPub signing key set/u,
    );

    const stored = await withPrimaryDatabase(() => storedKeyPair(instance.id));
    assert.deepEqual(stored.keyPairs, keyPairs);
  }
});

test('does not overwrite a JSON null key set', async () => {
  const instance = await createInstance(InstanceKind.LOCAL);
  await db
    .update(Instances)
    .set({ activityPubKeyPairs: sql`'null'::jsonb` })
    .where(eq(Instances.id, instance.id));

  await assert.rejects(ensureDrizzleLocalInstanceActorKeyPairs(instance.id));

  const stored = await db
    .select({
      keyPairs: Instances.activityPubKeyPairs,
      isSqlNull: sql<boolean>`${Instances.activityPubKeyPairs} IS NULL`,
    })
    .from(Instances)
    .where(eq(Instances.id, instance.id))
    .then(firstOrThrow);
  assert.equal(stored.keyPairs, null);
  assert.equal(stored.isSqlNull, false);
});

test('rejects missing or remote Instances without creating key material', async () => {
  const remote = await createInstance(InstanceKind.ACTIVITYPUB);

  await assert.rejects(ensureDrizzleLocalInstanceActorKeyPairs(randomUUID()), NotFoundError);
  await assert.rejects(ensureDrizzleLocalInstanceActorKeyPairs(remote.id), NotFoundError);

  const stored = await withPrimaryDatabase(() => storedKeyPair(remote.id));
  assert.equal(stored.keyPairs, null);
});
