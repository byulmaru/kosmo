import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDatabaseMigrations } from './migrate';

export function resolveRuntimeMigrationsFolder(entrypointUrl: string): string {
  const entrypointDirectory = dirname(fileURLToPath(entrypointUrl));
  const artifactDirectory = resolve(entrypointDirectory, '../../drizzle');
  if (existsSync(artifactDirectory)) {
    return artifactDirectory;
  }
  return resolve(entrypointDirectory, '../../../drizzle');
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypoint === import.meta.url) {
  await runDatabaseMigrations({
    migrationsFolder: resolveRuntimeMigrationsFolder(import.meta.url),
  });
}
