import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const RUNTIME_IMAGE_CONTRACTS = Object.freeze({
  web: Object.freeze({
    artifactDirectory: 'web',
    entrypoint: '/app/server-dist/web/index.mjs',
    requiresExpoDist: true,
    requiresMigrationAssets: false,
    requiresRuntimeDependencies: true,
    requiresWorkerRuntime: false,
  }),
  api: Object.freeze({
    artifactDirectory: 'api',
    entrypoint: '/app/server-dist/api/index.mjs',
    requiresExpoDist: false,
    requiresMigrationAssets: false,
    requiresRuntimeDependencies: true,
    requiresWorkerRuntime: false,
  }),
  worker: Object.freeze({
    artifactDirectory: 'worker',
    entrypoint: '/app/server-dist/worker/index.mjs',
    requiresExpoDist: false,
    requiresMigrationAssets: false,
    requiresRuntimeDependencies: true,
    requiresWorkerRuntime: true,
  }),
  'fedify-consumer': Object.freeze({
    artifactDirectory: 'fedify-consumer',
    entrypoint: '/app/server-dist/fedify-consumer/index.mjs',
    requiresExpoDist: false,
    requiresMigrationAssets: false,
    requiresRuntimeDependencies: true,
    requiresWorkerRuntime: false,
  }),
  migration: Object.freeze({
    artifactDirectory: 'migration',
    entrypoint: '/app/server-dist/migration/index.mjs',
    requiresExpoDist: false,
    requiresMigrationAssets: true,
    requiresRuntimeDependencies: false,
    requiresWorkerRuntime: false,
  }),
});

const runtimeNames = Object.keys(RUNTIME_IMAGE_CONTRACTS);

export const RUNTIME_PROBE_SCRIPT = String.raw`
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const runtime = process.env.KOSMO_RUNTIME;
const entrypoint = process.env.KOSMO_ENTRYPOINT;
const artifactRoot = '/app/server-dist';

function collectFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(path);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(path);
      }
    }
  }
  return files;
}

function collectCoreBridgeReleases() {
  const virtualStore = '/app/node_modules/.pnpm';
  if (!existsSync(virtualStore)) {
    return [];
  }

  const releases = [];
  for (const packageEntry of readdirSync(virtualStore, { withFileTypes: true })) {
    if (!packageEntry.isDirectory() || !packageEntry.name.startsWith('@temporalio+core-bridge@')) {
      continue;
    }

    const releasesPath = join(
      virtualStore,
      packageEntry.name,
      'node_modules/@temporalio/core-bridge/releases',
    );
    if (!existsSync(releasesPath)) {
      continue;
    }

    for (const releaseEntry of readdirSync(releasesPath, { withFileTypes: true })) {
      if (!releaseEntry.isDirectory()) {
        continue;
      }
      const binaryPath = join(releasesPath, releaseEntry.name, 'index.node');
      releases.push({
        package: packageEntry.name,
        platform: releaseEntry.name,
        binary: binaryPath,
        exists: existsSync(binaryPath),
      });
    }
  }
  return releases;
}

const artifactFiles = collectFiles(artifactRoot);
const runtimeFiles = runtime === 'web' ? collectFiles('/app/apps/app/dist') : [];
const sourceFiles = [...artifactFiles, ...runtimeFiles].filter((path) => /\.(?:cts|mts|ts|tsx)$/u.test(path));
const mapFiles = artifactFiles.filter((path) => path.endsWith('.map'));
const mapReferences = artifactFiles
  .filter((path) => /\.(?:c|m)?js$/u.test(path))
  .filter((path) => readFileSync(path, 'utf8').includes('sourceMappingURL='));
const forbiddenNodeModules = [
  '/app/node_modules',
  '/app/apps/api/node_modules',
  '/app/apps/app/node_modules',
  '/app/apps/fedify-consumer/node_modules',
  '/app/apps/worker/node_modules',
  '/app/apps/web/node_modules',
  '/app/packages/core/node_modules',
  '/app/packages/fedify/node_modules',
].filter((path) => existsSync(path));
const rootDependencyEntries = existsSync('/app/node_modules')
  ? readdirSync('/app/node_modules')
      .filter((name) => name !== '.pnpm' && name !== '.modules.yaml' && name !== '.pnpm-workspace-state-v1.json')
      .filter((name) => name !== '.package-map.json')
      .filter((name) => name !== '.bin')
      .sort()
  : [];
const tsxPaths = existsSync('/app/node_modules')
  ? collectFiles('/app/node_modules').filter((path) => /(?:^|\/)tsx(?:@|\/)/u.test(path))
  : [];

const report = {
  runtime,
  uid: process.getuid?.(),
  gid: process.getgid?.(),
  entrypointExists: existsSync(entrypoint),
  dispatcherExists: existsSync('/app/docker-entrypoint.sh'),
  artifactFiles,
  artifactDirectories: existsSync(artifactRoot)
    ? readdirSync(artifactRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [],
  sourceFiles,
  mapFiles,
  mapReferences,
  forbiddenNodeModules,
  rootDependencyEntries,
  tsxPaths,
  expoDistExists: existsSync('/app/apps/app/dist'),
  migrationAssets: existsSync('/app/drizzle')
    ? collectFiles('/app/drizzle').filter((path) => path.endsWith('.sql'))
    : [],
  workflowBundleExists: existsSync('/app/server-dist/worker/workflow-bundle.js'),
  coreBridgeReleases: collectCoreBridgeReleases(),
  packageJsonExists: existsSync('/app/package.json'),
  serverRuntimeSource: existsSync(entrypoint) ? readFileSync(entrypoint, 'utf8') : '',
};

process.stdout.write(JSON.stringify(report));
`;

function usage() {
  return [
    'Usage: node scripts/check-server-runtime-image.mjs --runtime <name> --image <ref> [options]',
    '',
    `Runtime names: ${runtimeNames.join(', ')}`,
    'Options:',
    '  --platform <platform>       Docker target platform (default: linux/arm64)',
    '  --baseline-image <ref>      Compare uncompressed image size against this image',
    '  --docker <path>             Docker executable (default: docker)',
  ].join('\n');
}

export function parseArguments(arguments_) {
  const options = { docker: 'docker', platform: 'linux/arm64' };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') {
      return { help: true };
    }

    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}.\n\n${usage()}`);
    }

    if (argument === '--runtime') {
      options.runtime = value;
    } else if (argument === '--image') {
      options.image = value;
    } else if (argument === '--platform') {
      options.platform = value;
    } else if (argument === '--baseline-image') {
      options.baselineImage = value;
    } else if (argument === '--docker') {
      options.docker = value;
    } else {
      throw new Error(`Unknown argument ${argument}.\n\n${usage()}`);
    }
    index += 1;
  }

  if (!options.runtime || !RUNTIME_IMAGE_CONTRACTS[options.runtime]) {
    throw new Error(`--runtime must be one of: ${runtimeNames.join(', ')}.\n\n${usage()}`);
  }
  if (!options.image) {
    throw new Error(`--image is required.\n\n${usage()}`);
  }

  return options;
}

async function dockerJson(docker, arguments_) {
  const { stdout } = await execFileAsync(docker, arguments_, { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function inspectImage(docker, image) {
  const records = await dockerJson(docker, ['image', 'inspect', image]);
  if (!Array.isArray(records) || records.length !== 1) {
    throw new Error(`Docker image inspect returned an unexpected result for ${image}.`);
  }
  return records[0];
}

async function probeImage({ docker, image, platform, runtime, contract }) {
  const { stdout } = await execFileAsync(
    docker,
    [
      'run',
      '--rm',
      '--platform',
      platform,
      '--entrypoint',
      'node',
      '--env',
      `KOSMO_RUNTIME=${runtime}`,
      '--env',
      `KOSMO_ENTRYPOINT=${contract.entrypoint}`,
      image,
      '--input-type=module',
      '-e',
      RUNTIME_PROBE_SCRIPT,
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function validateProbe({ imageRecord, baselineRecord, probe, runtime, contract }) {
  const failures = [];
  const config = imageRecord.Config ?? {};
  const entrypoint = config.Entrypoint ?? [];

  assertCondition(
    JSON.stringify(entrypoint) === JSON.stringify(['node', contract.entrypoint]),
    `Entrypoint must be ["node", "${contract.entrypoint}"], received ${JSON.stringify(entrypoint)}.`,
    failures,
  );
  assertCondition(
    probe.uid === 10001,
    `Container uid must be 10001, received ${probe.uid}.`,
    failures,
  );
  assertCondition(
    probe.gid === 10001,
    `Container gid must be 10001, received ${probe.gid}.`,
    failures,
  );
  assertCondition(
    probe.entrypointExists,
    `Entrypoint file is missing: ${contract.entrypoint}.`,
    failures,
  );
  assertCondition(
    !probe.dispatcherExists,
    'Legacy docker-entrypoint.sh must not be in split images.',
    failures,
  );
  assertCondition(
    probe.artifactDirectories.length === 1 &&
      probe.artifactDirectories[0] === contract.artifactDirectory,
    `Only ${contract.artifactDirectory} may be under /app/server-dist; received ${probe.artifactDirectories.join(', ')}.`,
    failures,
  );
  assertCondition(
    probe.artifactFiles.includes(`/app/server-dist/${contract.artifactDirectory}/index.mjs`),
    'The runtime JavaScript artifact is missing.',
    failures,
  );
  assertCondition(
    probe.artifactFiles.includes(`/app/server-dist/${contract.artifactDirectory}/meta.json`),
    'The runtime artifact metadata is missing.',
    failures,
  );
  assertCondition(
    probe.sourceFiles.length === 0,
    `TypeScript source is present: ${probe.sourceFiles.join(', ')}.`,
    failures,
  );
  assertCondition(
    probe.mapFiles.length === 0,
    `Source maps are present: ${probe.mapFiles.join(', ')}.`,
    failures,
  );
  assertCondition(
    probe.mapReferences.length === 0,
    `Source-map references are present: ${probe.mapReferences.join(', ')}.`,
    failures,
  );
  const unexpectedNodeModules = contract.requiresRuntimeDependencies
    ? probe.forbiddenNodeModules.filter((path) => path !== '/app/node_modules')
    : probe.forbiddenNodeModules;
  assertCondition(
    unexpectedNodeModules.length === 0,
    `Workspace node_modules are present: ${unexpectedNodeModules.join(', ')}.`,
    failures,
  );
  const expectedRootDependencies = contract.requiresWorkerRuntime
    ? ['@temporalio', 'jsdom']
    : contract.requiresRuntimeDependencies
      ? ['@temporalio', 'jsdom']
      : [];
  assertCondition(
    JSON.stringify(probe.rootDependencyEntries) === JSON.stringify(expectedRootDependencies),
    `Root runtime dependencies must be ${expectedRootDependencies.join(', ') || '(none)'}; received ${probe.rootDependencyEntries.join(', ') || '(none)'}.`,
    failures,
  );
  assertCondition(probe.tsxPaths.length === 0, 'Runtime dependency tree contains tsx.', failures);
  assertCondition(
    contract.requiresExpoDist === probe.expoDistExists,
    contract.requiresExpoDist
      ? 'Web static assets are missing.'
      : 'Non-Web image contains Expo static assets.',
    failures,
  );
  assertCondition(
    contract.requiresMigrationAssets === probe.migrationAssets.length > 0,
    contract.requiresMigrationAssets
      ? 'Migration SQL assets are missing.'
      : 'Non-Migration image contains drizzle assets.',
    failures,
  );

  if (contract.requiresWorkerRuntime) {
    const expectedRelease = 'aarch64-unknown-linux-gnu';
    assertCondition(probe.workflowBundleExists, 'Worker Workflow bundle is missing.', failures);
    assertCondition(
      probe.coreBridgeReleases.length === 1 &&
        probe.coreBridgeReleases[0].platform === expectedRelease &&
        probe.coreBridgeReleases[0].exists,
      `Worker must retain only ${expectedRelease} core-bridge release.`,
      failures,
    );
  }

  const sizeBytes = imageRecord.Size;
  const baselineSizeBytes = baselineRecord?.Size;
  if (baselineSizeBytes !== undefined) {
    assertCondition(
      sizeBytes < baselineSizeBytes,
      `Image size ${sizeBytes} is not smaller than baseline ${baselineSizeBytes}.`,
      failures,
    );
  }

  return {
    image: imageRecord.RepoTags?.[0] ?? imageRecord.Id,
    runtime,
    sizeBytes,
    layers: imageRecord.RootFS?.Layers?.length ?? null,
    baselineSizeBytes: baselineSizeBytes ?? null,
    checks: {
      entrypoint: entrypoint,
      uid: probe.uid,
      gid: probe.gid,
      artifactDirectory: contract.artifactDirectory,
      forbiddenNodeModules: probe.forbiddenNodeModules,
      rootDependencyEntries: probe.rootDependencyEntries,
      tsxPaths: probe.tsxPaths,
      sourceFiles: probe.sourceFiles,
      mapFiles: probe.mapFiles,
      mapReferences: probe.mapReferences,
      coreBridgeReleases: probe.coreBridgeReleases,
    },
    failures,
  };
}

export async function checkRuntimeImage({
  docker = 'docker',
  image,
  baselineImage,
  platform = 'linux/arm64',
  runtime,
}) {
  const contract = RUNTIME_IMAGE_CONTRACTS[runtime];
  if (!contract) {
    throw new Error(`Unknown runtime ${runtime}.`);
  }

  const imageRecord = await inspectImage(docker, image);
  const baselineRecord = baselineImage ? await inspectImage(docker, baselineImage) : undefined;
  const probe = await probeImage({ docker, image, platform, runtime, contract });
  const report = validateProbe({ imageRecord, baselineRecord, probe, runtime, contract });

  if (report.failures.length > 0) {
    throw new Error(
      `Runtime image gate failed:\n${report.failures.map((failure) => `- ${failure}`).join('\n')}`,
    );
  }

  return report;
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const report = await checkRuntimeImage(options);
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
