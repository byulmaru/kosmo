import { spawnSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

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

const serverArtifacts = [
  { entry: 'apps/api/src/entry.ts', outdir: 'apps/api/dist/server' },
  { entry: 'apps/web/src/server/entry.ts', outdir: 'apps/web/dist/server' },
];

for (const artifact of serverArtifacts) {
  await rm(path.join(workspaceRoot, artifact.outdir), { force: true, recursive: true });
  await build({
    bundle: true,
    chunkNames: 'chunks/[hash]',
    entryNames: 'index',
    entryPoints: [path.join(workspaceRoot, artifact.entry)],
    format: 'esm',
    legalComments: 'none',
    logLevel: 'info',
    outdir: path.join(workspaceRoot, artifact.outdir),
    outExtension: { '.js': '.mjs' },
    packages: 'external',
    platform: 'node',
    splitting: true,
    sourcemap: 'external',
    sourcesContent: true,
    target: 'node26',
  });
}

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

const artifactGroups = [
  { path: 'apps/api/dist/server', project: process.env.SENTRY_API_PROJECT },
  { path: 'apps/web/dist/server', project: process.env.SENTRY_WEB_BFF_PROJECT },
  { path: 'apps/app/dist', project: process.env.SENTRY_WEB_PROJECT },
];

for (const group of artifactGroups) {
  run(sentryCli, ['sourcemaps', 'inject', group.path, '--quiet']);
}

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
};

for (const group of artifactGroups) {
  const mapFiles = (await walkFiles(group.path)).filter((file) => file.endsWith('.map'));
  if (mapFiles.length === 0) {
    throw new Error(`No source maps were generated under ${group.path}`);
  }

  for (const mapFile of mapFiles) {
    const sourceMap = JSON.parse(await readFile(mapFile, 'utf8'));
    if (!Array.isArray(sourceMap.sourcesContent) || sourceMap.sourcesContent.length === 0) {
      throw new Error(`Source map is missing sourcesContent: ${mapFile}`);
    }
  }
}

let authToken = process.env.SENTRY_AUTH_TOKEN;
if (!authToken && process.env.SENTRY_AUTH_TOKEN_FILE) {
  try {
    authToken = (await readFile(process.env.SENTRY_AUTH_TOKEN_FILE, 'utf8')).trim();
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) {
      throw cause;
    }
  }
}

const release = process.env.SENTRY_RELEASE;
const organization = process.env.SENTRY_ORG;
const uploadRequired = process.env.SENTRY_UPLOAD_REQUIRED === '1';
const missingUploadConfiguration = [
  !authToken && 'SENTRY_AUTH_TOKEN',
  !organization && 'SENTRY_ORG',
  !release && 'SENTRY_RELEASE',
  ...artifactGroups.map((group) => !group.project && `project for ${group.path}`),
].filter(Boolean);

if (missingUploadConfiguration.length > 0 && uploadRequired) {
  throw new Error(
    `Missing required Sentry upload configuration: ${missingUploadConfiguration.join(', ')}`,
  );
}

if (missingUploadConfiguration.length === 0) {
  const uploadEnvironment = { ...process.env, SENTRY_AUTH_TOKEN: authToken };
  for (const group of artifactGroups) {
    run(
      sentryCli,
      [
        'sourcemaps',
        'upload',
        group.path,
        '--org',
        organization,
        '--project',
        group.project,
        '--release',
        release,
        '--strict',
        '--validate',
        '--wait',
        '--quiet',
      ],
      { env: uploadEnvironment },
    );
  }
} else {
  console.log('Sentry upload skipped; generated source maps were validated locally.');
}

for (const group of artifactGroups) {
  const files = await walkFiles(group.path);
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
}
