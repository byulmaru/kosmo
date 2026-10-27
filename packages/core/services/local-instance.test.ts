import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, mock, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg } from '../db';
import { bootstrapConfiguredLocalInstance } from '../db/seed/local-instance';
import { InstanceKind, InstanceState } from '../enums';
import { resolveConfiguredLocalInstance } from '../local-instance';
import { LocalInstanceConfigurationError } from '../local-instance-internal';

after(async () => pg.end());

test('runtime local instance cache recovers after a failed lookup', async () => {
  const domain = `cache-${randomUUID()}.example`;
  const publicOrigin = `https://${domain}`;
  const instance = {
    id: randomUUID(),
    canonicalOrigin: publicOrigin,
    domain,
    kind: InstanceKind.LOCAL,
    state: InstanceState.ACTIVE,
  };
  const previousPublicOrigin = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = publicOrigin;

  let rejectFirstQuery!: (error: Error) => void;
  const failedQuery = new Promise<never>((_, reject) => {
    rejectFirstQuery = reject;
  });
  let queryCount = 0;
  const select = mock.method(db, 'select', () => {
    queryCount += 1;
    const rows = queryCount === 1 ? failedQuery : Promise.resolve([instance]);

    return {
      from() {
        return this;
      },
      where() {
        return this;
      },
      limit() {
        return rows;
      },
    } as never;
  });

  try {
    const first = resolveConfiguredLocalInstance();
    const concurrentFirst = resolveConfiguredLocalInstance();
    assert.equal(queryCount, 1);

    const failure = new Error('temporary database failure');
    rejectFirstQuery(failure);
    await assert.rejects(first, (error: unknown) => error === failure);
    await assert.rejects(concurrentFirst, (error: unknown) => error === failure);

    const [recovered, concurrentRecovered] = await Promise.all([
      resolveConfiguredLocalInstance(),
      resolveConfiguredLocalInstance(),
    ]);
    assert.equal(queryCount, 2);
    assert.equal(recovered.id, instance.id);
    assert.equal(concurrentRecovered.id, instance.id);

    const cached = await resolveConfiguredLocalInstance();
    assert.equal(cached.id, instance.id);
    assert.equal(queryCount, 2);

    await resolveConfiguredLocalInstance({ publicOrigin });
    await resolveConfiguredLocalInstance({ publicOrigin });
    assert.equal(queryCount, 4);
  } finally {
    select.mock.restore();
    if (previousPublicOrigin === undefined) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = previousPublicOrigin;
    }
  }
});

test('runtime local instance resolution requires an existing configured row', async () => {
  const domain = `missing-${randomUUID()}.example`;
  const publicOrigin = `https://${domain}`;

  await assert.rejects(
    resolveConfiguredLocalInstance({ publicOrigin }),
    (error: unknown) =>
      error instanceof LocalInstanceConfigurationError &&
      error.message === 'Configured local instance row is missing',
  );
  assert.equal(
    await db
      .select()
      .from(Instances)
      .where(eq(Instances.domain, domain))
      .then((rows) => rows.length),
    0,
  );
});

test('bootstrap creates and reuses the configured local instance', async () => {
  const domain = `local-${randomUUID()}.example`;
  const publicOrigin = `https://${domain}`;

  const created = await bootstrapConfiguredLocalInstance({ publicOrigin });
  const bootstrappedAgain = await bootstrapConfiguredLocalInstance({ publicOrigin });
  const resolved = await resolveConfiguredLocalInstance({ publicOrigin });

  assert.equal(created.id, bootstrappedAgain.id);
  assert.equal(resolved.id, created.id);
  assert.equal(resolved.canonicalOrigin, publicOrigin);
  assert.equal(resolved.domain, domain);
  assert.equal(resolved.kind, InstanceKind.LOCAL);
  assert.equal(resolved.state, InstanceState.ACTIVE);
});

test('configured local Instance results omit stored ActivityPub key material', async () => {
  const domain = `local-keys-${randomUUID()}.example`;
  const publicOrigin = `https://${domain}`;
  const instance = {
    activityPubPublicKeyJwk: { kty: 'RSA', n: 'public-marker' },
    activityPubPrivateKeyJwk: { kty: 'RSA', d: 'private-marker' },
    canonicalOrigin: publicOrigin,
    createdAt: new Date(),
    domain,
    id: randomUUID(),
    kind: InstanceKind.LOCAL,
    state: InstanceState.ACTIVE,
    updatedAt: new Date(),
  };
  const select = mock.method(
    db,
    'select',
    () =>
      ({
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return Promise.resolve([instance]);
        },
      }) as never,
  );

  try {
    const resolved = await resolveConfiguredLocalInstance({ publicOrigin });
    const serialized = JSON.stringify(resolved);

    assert.equal(Object.hasOwn(resolved, 'activityPubPublicKeyJwk'), false);
    assert.equal(Object.hasOwn(resolved, 'activityPubPrivateKeyJwk'), false);
    assert.equal(serialized.includes('public-marker'), false);
    assert.equal(serialized.includes('private-marker'), false);
  } finally {
    select.mock.restore();
  }
});

test('bootstrap and runtime resolution reject a mismatched configured row', async () => {
  const domain = `remote-${randomUUID()}.example`;
  const publicOrigin = `https://${domain}`;

  await db
    .insert(Instances)
    .values({
      canonicalOrigin: publicOrigin,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  for (const operation of [
    () => bootstrapConfiguredLocalInstance({ publicOrigin }),
    () => resolveConfiguredLocalInstance({ publicOrigin }),
  ]) {
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof LocalInstanceConfigurationError &&
        error.message === 'Configured local instance row does not match PUBLIC_ORIGIN',
    );
  }
});
