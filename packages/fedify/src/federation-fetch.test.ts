import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { db, firstOrThrow, Instances, pg } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { createFedifyExecutionContext, federation, fetchFederation } from './federation';
import type { FederationFetchOptions } from '@fedify/fedify';
import type { FedifyExecutionContext } from './federation';

const typedFederation = federation;

after(async () => {
  mock.restoreAll();
  await pg.end();
});

test('Fedify fetch creates an isolated owner-handle context per invocation', async () => {
  const contexts: FedifyExecutionContext[] = [];
  mock.method(
    typedFederation,
    'fetch',
    async (_request: Request, options: FederationFetchOptions<FedifyExecutionContext>) => {
      contexts.push(options.contextData);
      return new Response('ok');
    },
  );

  const request = new Request('https://kos.moe/inbox');
  await fetchFederation(request, {});
  await fetchFederation(request, {});

  assert.equal(contexts.length, 2);
  assert.notEqual(contexts[0], contexts[1]);
  assert.equal(contexts[0]?.db, db);
  assert.equal(contexts[1]?.db, db);
});

test('Fedify actions commit and rollback on their own transaction boundary', async () => {
  const context = createFedifyExecutionContext();
  const domain = `${crypto.randomUUID()}.example`;
  const inserted = await context.db.transaction((transaction) =>
    transaction
      .insert(Instances)
      .values({ domain, kind: InstanceKind.LOCAL })
      .returning()
      .then(firstOrThrow),
  );

  assert.equal(inserted.domain, domain);
  assert.equal((await db.select().from(Instances).where(eq(Instances.id, inserted.id))).length, 1);

  const rollbackDomain = `${crypto.randomUUID()}.example`;
  await assert.rejects(
    context.db.transaction(async (transaction) => {
      await transaction.insert(Instances).values({
        domain: rollbackDomain,
        kind: InstanceKind.LOCAL,
      });
      throw new Error('Fedify action rollback');
    }),
    /Fedify action rollback/,
  );
  assert.equal(
    (await db.select().from(Instances).where(eq(Instances.domain, rollbackDomain))).length,
    0,
  );
});

test('Fedify action joins a caller transaction through a savepoint', async () => {
  const contextIdentity = createFedifyExecutionContext();
  const domain = `${crypto.randomUUID()}.example`;

  await assert.rejects(
    db.transaction(async (outerTransaction) => {
      await createFedifyExecutionContext(outerTransaction).db.transaction((transaction) =>
        transaction.insert(Instances).values({ domain, kind: InstanceKind.LOCAL }),
      );
      throw new Error('caller rollback');
    }),
    /caller rollback/,
  );

  assert.equal((await db.select().from(Instances).where(eq(Instances.domain, domain))).length, 0);

  // Exceed the configured pool size so leaked action transactions would exhaust it.
  for (let index = 0; index < 25; index += 1) {
    const actionContext = createFedifyExecutionContext();
    assert.notEqual(actionContext, contextIdentity);
    if (index % 2 === 0) {
      await actionContext.db.transaction((transaction) =>
        transaction
          .insert(Instances)
          .values({ domain: `${crypto.randomUUID()}.example`, kind: InstanceKind.LOCAL }),
      );
    } else {
      await assert.rejects(
        actionContext.db.transaction(() => Promise.reject(new Error('repeated rollback'))),
        /repeated rollback/,
      );
    }
  }

  await createFedifyExecutionContext().db.transaction((transaction) =>
    transaction.select({ id: Instances.id }).from(Instances).limit(1),
  );
});
