import { env } from '@kosmo/env';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./schemas/tables.ts', './schemas/enums.ts'],
  out: './drizzle',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ['!internal_*'],
});
