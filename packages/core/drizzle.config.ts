import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dialect: 'postgresql',
  schema: [join(configDir, 'db/tables.ts'), join(configDir, 'db/enums.ts')],
  out: join(configDir, '../../drizzle'),
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
