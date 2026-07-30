import '@kosmo/core/polyfill';

import { pg } from '@kosmo/core/db';
import { backfillLocalMediaRepresentations } from '../src/media-representation-backfill';

try {
  const result = await backfillLocalMediaRepresentations();
  console.log(JSON.stringify(result));
  if (result.failed > 0) {
    throw new Error(`Failed to backfill ${result.failed} Local Media representations`);
  }
} finally {
  await pg.end();
}
