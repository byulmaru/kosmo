import { bootstrapConfiguredLocalInstance, db, pg } from '@kosmo/core/db';

try {
  const instance = await bootstrapConfiguredLocalInstance(db);
  console.log(
    `Configured local instance: ${instance.domain} (${instance.canonicalOrigin ?? 'no origin'})`,
  );
} finally {
  await pg.end();
}
