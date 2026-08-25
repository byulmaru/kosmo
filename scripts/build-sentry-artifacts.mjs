import { spawnSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const sentryCli = path.join(workspaceRoot, 'node_modules/.bin/sentry-cli');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
};

run('pnpm', ['build:server-artifacts']);
run('pnpm', ['--filter', '@kosmo/app', 'relay']);
run('pnpm', [
  '--filter',
  '@kosmo/app',
  'exec',
  'expo',
  'export',
  '--clear',
  '--platform',
  'web',
  '--source-maps',
  'external',
]);

const artifactPaths = ['apps/app/dist', 'server-dist/api', 'server-dist/web'];

for (const artifactPath of artifactPaths) {
  run(sentryCli, ['sourcemaps', 'inject', artifactPath, '--quiet']);
}

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
};

const filesByArtifact = await Promise.all(artifactPaths.map(walkFiles));
const mapFiles = filesByArtifact.flat().filter((file) => file.endsWith('.map'));
if (mapFiles.length === 0) {
  throw new Error(`No source maps were generated under ${artifactPaths.join(', ')}`);
}

for (const mapFile of mapFiles) {
  const sourceMap = JSON.parse(await readFile(mapFile, 'utf8'));
  if (!Array.isArray(sourceMap.sourcesContent) || sourceMap.sourcesContent.length === 0) {
    throw new Error(`Source map is missing sourcesContent: ${mapFile}`);
  }
}

const authToken = process.env.SENTRY_AUTH_TOKEN;
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const organization = process.env.SENTRY_ORG;
const project = process.env.SENTRY_PROJECT;
const release = process.env.SENTRY_RELEASE;
const uploadRequired = process.env.SENTRY_UPLOAD_REQUIRED === '1';
const missingUploadConfiguration = [
  !authToken && 'SENTRY_AUTH_TOKEN',
  !dsn && 'EXPO_PUBLIC_SENTRY_DSN',
  !organization && 'SENTRY_ORG',
  !project && 'SENTRY_PROJECT',
  !release && 'SENTRY_RELEASE',
].filter(Boolean);

if (missingUploadConfiguration.length > 0 && uploadRequired) {
  throw new Error(
    `Missing required Sentry upload configuration: ${missingUploadConfiguration.join(', ')}`,
  );
}

if (missingUploadConfiguration.length === 0) {
  const uploadEnvironment = { ...process.env, SENTRY_AUTH_TOKEN: authToken };
  run(
    sentryCli,
    [
      'sourcemaps',
      'upload',
      ...artifactPaths,
      '--org',
      organization,
      '--project',
      project,
      '--release',
      release,
      '--strict',
      '--validate',
      '--wait',
      '--quiet',
    ],
    { env: uploadEnvironment },
  );
} else {
  console.log('Sentry upload skipped; generated source maps were validated locally.');
}

const files = filesByArtifact.flat();
await Promise.all(files.filter((file) => file.endsWith('.map')).map((file) => rm(file)));
await Promise.all(
  files
    .filter((file) => /\.(?:c|m)?js$/.test(file))
    .map(async (file) => {
      const source = await readFile(file, 'utf8');
      const withoutMapReference = source.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
      await writeFile(file, withoutMapReference);
    }),
);
