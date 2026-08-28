import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { db, pg, Profiles } from '../packages/core/db/index.ts';
import { resolveConfiguredLocalInstance } from '../packages/core/local-instance.ts';
import { profileHandlePolicyViolation } from '../packages/core/validation/profile.ts';

const require = createRequire(import.meta.url);
const { eq } = require('../packages/core/node_modules/drizzle-orm');

export const auditProfileHandleRows = (rows) => {
  const systemReservedProfileIds = [];
  const explicitlyHarmfulProfileIds = [];

  for (const row of rows) {
    const violation = profileHandlePolicyViolation(row.handle);

    if (violation === 'system-reserved') {
      systemReservedProfileIds.push(row.id);
    } else if (violation === 'explicitly-harmful') {
      explicitlyHarmfulProfileIds.push(row.id);
    }
  }

  return {
    explicitlyHarmfulProfileCount: explicitlyHarmfulProfileIds.length,
    explicitlyHarmfulProfileIds,
    profileCount: rows.length,
    systemReservedProfileCount: systemReservedProfileIds.length,
    systemReservedProfileIds,
  };
};

export const auditConfiguredLocalProfileHandles = async () => {
  const localInstance = await resolveConfiguredLocalInstance();
  const rows = await db
    .select({ handle: Profiles.handle, id: Profiles.id })
    .from(Profiles)
    .where(eq(Profiles.instanceId, localInstance.id));

  return {
    localInstance: { domain: localInstance.domain, id: localInstance.id },
    profiles: auditProfileHandleRows(rows),
  };
};

const run = async () => {
  try {
    console.log(JSON.stringify(await auditConfiguredLocalProfileHandles()));
  } finally {
    await pg.end();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
