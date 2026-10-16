import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreRequire = createRequire(resolve(root, 'packages/core/package.json'));
const drizzleKitEntry = coreRequire.resolve('drizzle-kit');
const drizzleKitDirectory = dirname(drizzleKitEntry);
const drizzleKitBin = join(drizzleKitDirectory, 'bin.cjs');
const instrumentedBin = join(drizzleKitDirectory, `.bin.cjs.diagnostic-${process.pid}.cjs`);

const source = readFileSync(drizzleKitBin, 'utf8');
const anchor = [
  'resolver = (entity, defaultSchema = "public") => {',
  '\t\treturn async (it) => {',
  '\t\t\tconst { created, deleted } = it;',
  '\t\t\tif (created.length === 0 || deleted.length === 0) return {',
].join('\n');

if (source.split(anchor).length !== 2) {
  throw new Error('Expected exactly one Drizzle Kit resolver to instrument');
}

const diagnostic = [
  'resolver = (entity, defaultSchema = "public") => {',
  '\t\treturn async (it) => {',
  '\t\t\tconst { created, deleted } = it;',
  '\t\t\tif (created.length > 0 && deleted.length > 0) {',
  '\t\t\t\tconst describe = (items) => items.map(({ name, schema, table }) => ({ name, schema, table }));',
  '\t\t\t\tconsole.error("[drizzle-push-diagnostic]", JSON.stringify({ entity, created: describe(created), deleted: describe(deleted) }));',
  '\t\t\t}',
  '\t\t\tif (created.length === 0 || deleted.length === 0) return {',
].join('\n');

writeFileSync(instrumentedBin, source.replace(anchor, diagnostic), {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});

try {
  const syntaxCheck = spawnSync(process.execPath, ['--check', instrumentedBin], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (syntaxCheck.error) {
    throw syntaxCheck.error;
  }
  if (syntaxCheck.status !== 0) {
    process.exitCode = syntaxCheck.status ?? 1;
  } else {
    const result = spawnSync(process.execPath, [instrumentedBin, ...process.argv.slice(2)], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) {
      throw result.error;
    }
    process.exitCode = result.status ?? 1;
  }
} finally {
  rmSync(instrumentedBin, { force: true });
}
