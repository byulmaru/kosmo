import '@kosmo/core/polyfill';

import { pg } from '@kosmo/core/db';
import { seedDatabase } from '@kosmo/core/db/seed';

try {
  const { localInstance } = await seedDatabase();
  console.log(
    `Configured local instance: ${localInstance.domain} (${localInstance.canonicalOrigin ?? 'no origin'})`,
  );
} finally {
  await pg.end();
}
