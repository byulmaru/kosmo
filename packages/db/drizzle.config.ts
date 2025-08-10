import { defineConfig } from 'drizzle-kit';
import { env } from './env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './schemas/tables.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ['!internal_*'],
});
