import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg } from '../db';
import { bootstrapConfiguredLocalInstance } from '../db/seed/local-instance';
import { InstanceKind, InstanceState } from '../enums';
import { resolveConfiguredLocalInstance } from '../local-instance';
import { LocalInstanceConfigurationError } from '../local-instance-internal';

after(async () => pg.end());

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
