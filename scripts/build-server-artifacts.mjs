import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildTemporalWorkflowBundle } from './build-temporal-workflow-bundle.mjs';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER_ARTIFACT_OUTPUT_ROOT = resolve(workspaceRoot, 'server-dist');

const entryPoints = {
  web: 'apps/web/src/server/index.ts',
  api: 'apps/api/src/index.ts',
  worker: 'apps/worker/src/index.ts',
  'fedify-consumer': 'apps/fedify-consumer/src/index.ts',
  migration: 'packages/core/db/migrate-entry.ts',
};

const bundleWorkspacePackages = {
  name: 'bundle-workspace-packages',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^@kosmo\// }, (arguments_) => ({
      path: createRequire(arguments_.importer).resolve(arguments_.path),
    }));
  },
};

export async function buildServerArtifacts() {
  await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });

  try {
    await build({
      absWorkingDir: workspaceRoot,
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      },
      bundle: true,
      entryNames: '[name]/index',
      entryPoints,
      format: 'esm',
      outdir: SERVER_ARTIFACT_OUTPUT_ROOT,
      outExtension: { '.js': '.mjs' },
      packages: 'external',
      platform: 'node',
      plugins: [bundleWorkspacePackages],
      sourcemap: 'external',
      sourcesContent: true,
      target: 'node26',
    });
    await buildTemporalWorkflowBundle({
      outputDir: resolve(SERVER_ARTIFACT_OUTPUT_ROOT, 'worker'),
    });
  } catch (error) {
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
    throw error;
  }
}

if (import.meta.main) {
  await buildServerArtifacts();
}
