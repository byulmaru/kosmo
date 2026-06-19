import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const configDir = dirname(fileURLToPath(import.meta.url));

// drizzle-kit feeds each schema path straight into `glob`, which treats `\` as an
// escape character. On Windows `join` produces backslash paths, so the glob matches
// nothing ("No schema files found"). Normalize to forward slashes to keep matching.
const schemaPath = (...segments: string[]) => join(configDir, ...segments).replaceAll('\\', '/');

export default defineConfig({
  dialect: 'postgresql',
  schema: [schemaPath('db/tables.ts'), schemaPath('db/enums.ts')],
  out: join(configDir, '../../drizzle'),
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
