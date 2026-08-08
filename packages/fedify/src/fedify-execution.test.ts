import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { db, firstOrThrow, Instances, pg } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { createFedifyExecutionContext, withFedifyAction } from './fedify-execution';

after(async () => {
  await pg.end();
});

test('Fedify actions commit and rollback on their own transaction boundary', async () => {
  const context = createFedifyExecutionContext();
  const domain = `${crypto.randomUUID()}.example`;
  const inserted = await withFedifyAction(context, ({ db: transaction }) =>
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
    withFedifyAction(context, async ({ db: transaction }) => {
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
      await withFedifyAction(
        createFedifyExecutionContext(outerTransaction),
        ({ db: transaction }) =>
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
      await withFedifyAction(actionContext, ({ db: transaction }) =>
        transaction
          .insert(Instances)
          .values({ domain: `${crypto.randomUUID()}.example`, kind: InstanceKind.LOCAL }),
      );
    } else {
      await assert.rejects(
        withFedifyAction(actionContext, () => Promise.reject(new Error('repeated rollback'))),
        /repeated rollback/,
      );
    }
  }

  await withFedifyAction(createFedifyExecutionContext(), ({ db: transaction }) =>
    transaction.select({ id: Instances.id }).from(Instances).limit(1),
  );
});
