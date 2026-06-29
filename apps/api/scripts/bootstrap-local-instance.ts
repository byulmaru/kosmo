import { db, pg } from '@kosmo/core/db';
import { bootstrapConfiguredLocalInstance } from '@kosmo/core/db/seed';

try {
  const instance = await bootstrapConfiguredLocalInstance(db);
  console.log(
    `Configured local instance: ${instance.domain} (${instance.canonicalOrigin ?? 'no origin'})`,
  );
} finally {
  await pg.end();
}
