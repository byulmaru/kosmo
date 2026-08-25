import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const RUNTIME_IMAGE_CONTRACTS = Object.freeze({
  web: Object.freeze({
    artifactDirectory: 'web',
    entrypoint: '/app/server-dist/web/index.mjs',
    expo: true,
  }),
  api: Object.freeze({
    artifactDirectory: 'api',
    entrypoint: '/app/server-dist/api/index.mjs',
  }),
  worker: Object.freeze({
    artifactDirectory: 'worker',
    entrypoint: '/app/server-dist/worker/index.mjs',
    worker: true,
  }),
  'fedify-consumer': Object.freeze({
    artifactDirectory: 'fedify-consumer',
    entrypoint: '/app/server-dist/fedify-consumer/index.mjs',
  }),
  migration: Object.freeze({
    artifactDirectory: 'migration',
    entrypoint: '/app/server-dist/migration/index.mjs',
    migrations: true,
  }),
});

const runtimeNames = Object.keys(RUNTIME_IMAGE_CONTRACTS);

const probeSource = String.raw`
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const runtime = process.env.KOSMO_RUNTIME;
const entrypoint = process.env.KOSMO_ENTRYPOINT;

function walk(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path);
      else files.push(path);
    }
  }
  return files;
}

const artifactRoot = '/app/server-dist';
const artifactDirectory = join(artifactRoot, runtime);
const artifactFiles = walk(artifactRoot);
const manifestPath = join(artifactDirectory, 'runtime-package.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : undefined;
const dependencies = Object.keys(manifest?.dependencies ?? {}).sort();
const nodeModules = existsSync('/app/node_modules');
let workerPackage;
try {
  workerPackage = createRequire(entrypoint).resolve('@temporalio/worker/package.json');
} catch {
  workerPackage = undefined;
}
let bridgeReleases = [];
if (workerPackage) {
  const workerRequire = createRequire(workerPackage);
  const releases = join(dirname(workerRequire.resolve('@temporalio/core-bridge')), 'releases');
  bridgeReleases = readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      platform: entry.name,
      binary: existsSync(join(releases, entry.name, 'index.node')),
    }));
}

process.stdout.write(JSON.stringify({
  uid: process.getuid(),
  gid: process.getgid(),
  entrypoint: existsSync(entrypoint),
  dispatcher: existsSync('/app/docker-entrypoint.sh'),
  artifactDirectories: existsSync(artifactRoot)
    ? readdirSync(artifactRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [],
  artifactFiles,
  sourceFiles: walk('/app').filter((path) => /\.(?:cts|mts|ts|tsx)$/u.test(path)),
  mapFiles: artifactFiles.filter((path) => path.endsWith('.map')),
  sourceMapReference: artifactFiles
    .filter((path) => /\.(?:c|m)?js$/u.test(path))
    .some((path) => readFileSync(path, 'utf8').includes('sourceMappingURL=')),
  runtimePackage: manifest !== undefined,
  nodeModules,
  dependencies,
  missingDependencies: dependencies.filter(
    (dependency) => !existsSync(join('/app/node_modules', dependency)),
  ),
  tsx: dependencies.includes('tsx') || existsSync('/app/node_modules/tsx'),
  workerPackage: workerPackage !== undefined,
  bridgeReleases,
  expo: existsSync('/app/apps/app/dist'),
  migrations: walk('/app/drizzle').some((path) => path.endsWith('.sql')),
  workflowBundle: existsSync('/app/server-dist/worker/workflow-bundle.js'),
}));
`;

function usage() {
  return `Usage: node scripts/check-server-runtime-image.mjs --runtime <${runtimeNames.join('|')}> --image <ref> [--baseline-image <ref>] [--platform <platform>]`;
}

export function parseArguments(arguments_) {
  const options = { docker: 'docker', platform: 'linux/arm64' };
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    if (key === '--help' || key === '-h') {
      return { help: true };
    }
    const value = arguments_[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${key}.\n\n${usage()}`);
    }
    if (key === '--runtime') {
      options.runtime = value;
    } else if (key === '--image') {
      options.image = value;
    } else if (key === '--baseline-image') {
      options.baselineImage = value;
    } else if (key === '--platform') {
      options.platform = value;
    } else if (key === '--docker') {
      options.docker = value;
    } else {
      throw new Error(`Unknown argument ${key}.\n\n${usage()}`);
    }
  }
  if (!RUNTIME_IMAGE_CONTRACTS[options.runtime]) {
    throw new Error(`--runtime must be one of: ${runtimeNames.join(', ')}.\n\n${usage()}`);
  }
  if (!options.image) {
    throw new Error(`--image is required.\n\n${usage()}`);
  }
  return options;
}

async function dockerJson(docker, arguments_) {
  const { stdout } = await execFileAsync(docker, arguments_, { maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function inspectImage(docker, image) {
  const [record] = await dockerJson(docker, ['image', 'inspect', image]);
  if (!record) {
    throw new Error(`Docker image inspect found no record for ${image}.`);
  }
  return record;
}

async function probeImage({ docker, image, platform, runtime, entrypoint }) {
  return dockerJson(docker, [
    'run',
    '--rm',
    '--platform',
    platform,
    '--entrypoint',
    'node',
    '--env',
    `KOSMO_RUNTIME=${runtime}`,
    '--env',
    `KOSMO_ENTRYPOINT=${entrypoint}`,
    image,
    '--input-type=module',
    '-e',
    probeSource,
  ]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Runtime image gate failed: ${message}`);
  }
}

function artifactPath(directory, file) {
  return `/app/server-dist/${directory}/${file}`;
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
  const probe = await probeImage({
    docker,
    image,
    platform,
    runtime,
    entrypoint: contract.entrypoint,
  });
  const requiredFiles = ['index.mjs', 'meta.json'];
  if (contract.worker) {
    requiredFiles.push('runtime-package.json');
  }
  const requiredArtifactFiles = requiredFiles.map((file) =>
    artifactPath(contract.artifactDirectory, file),
  );

  assert(
    JSON.stringify(imageRecord.Config?.Entrypoint) ===
      JSON.stringify(['node', contract.entrypoint]),
    `unexpected entrypoint ${JSON.stringify(imageRecord.Config?.Entrypoint)}`,
  );
  assert(probe.uid === 10001 && probe.gid === 10001, 'runtime must use uid/gid 10001');
  assert(probe.entrypoint && !probe.dispatcher, 'fixed JavaScript entrypoint is not isolated');
  assert(
    probe.artifactDirectories.length === 1 &&
      probe.artifactDirectories[0] === contract.artifactDirectory,
    `unexpected artifact directories: ${probe.artifactDirectories.join(', ')}`,
  );
  assert(
    requiredArtifactFiles.every((file) => probe.artifactFiles.includes(file)),
    'artifact, metadata, or Worker runtime manifest is missing',
  );
  assert(probe.sourceFiles.length === 0, `TypeScript source remains: ${probe.sourceFiles[0]}`);
  assert(probe.mapFiles.length === 0 && !probe.sourceMapReference, 'source map remains');
  if (contract.worker) {
    assert(probe.runtimePackage && probe.nodeModules, 'Worker runtime dependencies are missing');
    assert(probe.missingDependencies.length === 0, 'Worker runtime manifest is incomplete');
  } else {
    assert(
      !probe.runtimePackage && !probe.nodeModules,
      'non-Worker image contains runtime dependencies',
    );
  }
  assert(!probe.tsx, 'runtime manifest contains tsx');
  assert(probe.expo === Boolean(contract.expo), 'Expo assets are in the wrong image');
  assert(
    probe.migrations === Boolean(contract.migrations),
    'migration assets are in the wrong image',
  );
  assert(probe.workerPackage === Boolean(contract.worker), 'Worker SDK is in the wrong image');
  if (contract.worker) {
    assert(probe.workflowBundle, 'prebuilt Workflow bundle is missing');
    assert(
      probe.bridgeReleases.length === 1 &&
        probe.bridgeReleases[0].platform === 'aarch64-unknown-linux-gnu' &&
        probe.bridgeReleases[0].binary,
      'Worker must contain only the Linux/ARM64 native bridge',
    );
  }
  if (baselineRecord) {
    assert(imageRecord.Size < baselineRecord.Size, 'image is not smaller than the baseline');
  }

  return {
    image: imageRecord.RepoTags?.[0] ?? imageRecord.Id,
    runtime,
    sizeBytes: imageRecord.Size,
    baselineSizeBytes: baselineRecord?.Size ?? null,
    layers: imageRecord.RootFS?.Layers?.length ?? null,
    dependencies: probe.dependencies,
  };
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(options.help ? usage() : JSON.stringify(await checkRuntimeImage(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
