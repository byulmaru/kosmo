import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const workerManifestPath = resolve(repositoryRoot, 'apps/worker/package.json');
const workerRequire = createRequire(workerManifestPath);

export const productionWorkflowExports = [
  'postCreateEffectsWorkflow',
  'postDeleteWorkflow',
  'profileUpdateEffectsWorkflow',
  'reactionCreateEffectsWorkflow',
  'reactionDeleteEffectsWorkflow',
  'postRepostWorkflow',
  'repostDeleteWorkflow',
];

// These packages stay external to the Worker host bundle. Their production
// dependency tree, including the target @temporalio/core-bridge .node binary,
// belongs only to the Worker final image.
export const assetRuntimeExternalPackages = ['@temporalio/client', 'jsdom'];
export const workerRuntimeExternalPackages = [
  ...assetRuntimeExternalPackages,
  '@temporalio/worker',
];

function parseArguments(arguments_) {
  const options = {
    outputDir: resolve(repositoryRoot, 'server-dist/worker'),
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--output-dir') {
      const value = arguments_[index + 1];
      if (!value) {
        throw new Error('--output-dir requires a path');
      }
      options.outputDir = isAbsolute(value) ? value : resolve(repositoryRoot, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function temporalLogger() {
  const log = (level, message, metadata) => {
    const suffix = metadata === undefined ? '' : ` ${JSON.stringify(metadata)}`;
    process.stderr.write(`[temporal-workflow-bundle] ${level}: ${message}${suffix}\n`);
  };
  return {
    debug(message, metadata) {
      log('debug', message, metadata);
    },
    info(message, metadata) {
      log('info', message, metadata);
    },
    warn(message, metadata) {
      log('warn', message, metadata);
    },
    error(message, metadata) {
      log('error', message, metadata);
    },
  };
}

function sourceExportNames(source) {
  return [...source.matchAll(/export\s*\{([^}]+)\}/g)]
    .flatMap(([, exports]) =>
      exports
        .split(',')
        .map((entry) => entry.trim().split(/\s+as\s+/u)[1] || entry.trim().split(/\s+/u)[0])
        .filter(Boolean),
    )
    .sort();
}

function assertEqualNames(actual, expected, description) {
  const actualValue = JSON.stringify(actual);
  const expectedValue = JSON.stringify(expected);
  if (actualValue !== expectedValue) {
    throw new Error(`${description} mismatch: expected ${expectedValue}, received ${actualValue}`);
  }
}

async function writeAtomically(path, contents) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

/**
 * Build the Temporal Workflow bundle used by the production Worker host.
 *
 * This intentionally delegates Workflow compilation to the exact
 * @temporalio/worker package resolved from apps/worker. The Worker host can
 * remain an ESM artifact with Temporal's native/runtime packages externalized,
 * while this bundle is loaded through WorkerOptions.workflowBundle.
 */
export async function buildTemporalWorkflowBundle({
  outputDir = resolve(repositoryRoot, 'server-dist/worker'),
} = {}) {
  const workflowSourcePath = resolve(repositoryRoot, 'apps/worker/src/workflows/index.ts');
  const workflowBundlePath = resolve(outputDir, 'workflow-bundle.js');
  const workflowSource = await readFile(workflowSourcePath, 'utf8');
  const sourceNames = sourceExportNames(workflowSource);
  assertEqualNames(sourceNames, [...productionWorkflowExports].sort(), 'Workflow registry');

  const workerPackagePath = workerRequire.resolve('@temporalio/worker/package.json');
  const workerPackage = JSON.parse(await readFile(workerPackagePath, 'utf8'));
  const { bundleWorkflowCode } = workerRequire('@temporalio/worker');

  await mkdir(outputDir, { recursive: true });
  await rm(workflowBundlePath, { force: true });

  const bundle = await bundleWorkflowCode({
    logger: temporalLogger(),
    workflowsPath: workflowSourcePath,
  });
  const missingExports = productionWorkflowExports.filter((name) => !bundle.code.includes(name));
  if (missingExports.length > 0) {
    throw new Error(`Workflow bundle is missing exports: ${missingExports.join(', ')}`);
  }

  const runtimeCode = bundle.code.replace(/^\/\/# sourceMappingURL=data:.*$/gmu, '');
  if (/sourceMappingURL/u.test(runtimeCode)) {
    throw new Error('Workflow runtime bundle still contains a source map reference.');
  }

  await writeAtomically(workflowBundlePath, runtimeCode);
  return {
    artifact: relative(repositoryRoot, workflowBundlePath),
    bytes: Buffer.byteLength(runtimeCode),
    package: '@temporalio/worker',
    workerVersion: workerPackage.version,
    externalRuntimePackages: [...workerRuntimeExternalPackages],
    workflowSource: relative(repositoryRoot, workflowSourcePath),
    workflowExports: [...productionWorkflowExports],
  };
}

if (import.meta.main) {
  try {
    const { outputDir } = parseArguments(process.argv.slice(2));
    const metadata = await buildTemporalWorkflowBundle({ outputDir });
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
