import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  buildServerArtifacts,
  SERVER_ARTIFACT_OUTPUT_ROOT,
  SERVER_ARTIFACT_TARGET,
  SERVER_ARTIFACTS,
} from './build-server-artifacts.mjs';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const migrationArtifact = SERVER_ARTIFACTS.find(({ name }) => name === 'migration');
const execFileAsync = promisify(execFile);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('builds every server artifact with ESM metadata and external source maps', async () => {
  try {
    const manifest = await buildServerArtifacts();

    assert.equal(manifest.nodeTarget, SERVER_ARTIFACT_TARGET);
    assert.deepEqual(
      manifest.artifacts.map(({ name }) => name),
      SERVER_ARTIFACTS.map(({ name }) => name),
    );
    const worker = manifest.artifacts.find(({ name }) => name === 'worker');
    assert.ok(worker);
    assert.ok(worker.files.includes('workflow-bundle.js'));
    assert.equal(worker.workflowBundle.package, '@temporalio/worker');
    assert.match(worker.workflowBundle.workerVersion, /^1\.22\./);
    assert.ok(worker.workflowBundle.workflowExports.length > 0);

    for (const artifact of manifest.artifacts) {
      const directory = join(workspaceRoot, artifact.directory);
      const sourceMap = JSON.parse(await readFile(join(directory, 'index.mjs.map'), 'utf8'));
      const metadata = JSON.parse(await readFile(join(directory, 'meta.json'), 'utf8'));
      const runtimePackage = JSON.parse(
        await readFile(join(directory, 'runtime-package.json'), 'utf8'),
      );
      const source = await readFile(join(directory, 'index.mjs'), 'utf8');

      assert.match(source, /\bimport\b/);
      assert.equal(metadata.format, 'esm');
      assert.equal(metadata.nodeTarget, SERVER_ARTIFACT_TARGET);
      assert.ok(Object.keys(metadata.inputs).length > 0);
      assert.ok(sourceMap.sourcesContent?.length > 0);
      assert.deepEqual(runtimePackage.dependencies, metadata.runtimeDependencies);
      assert.deepEqual(runtimePackage.dependencies, artifact.runtimeDependencies);
      assert.equal(runtimePackage.dependencies.tsx, undefined);
      assert.equal(
        Object.keys(runtimePackage.dependencies).some((dependency) =>
          dependency.startsWith('@kosmo/'),
        ),
        false,
      );
    }

    assert.equal(worker.runtimeDependencies['@temporalio/worker'], '1.22.0');
    for (const artifact of manifest.artifacts.filter(({ name }) => name !== 'worker')) {
      assert.equal(artifact.runtimeDependencies['@temporalio/worker'], undefined);
    }
  } finally {
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
  }
});

test('removes stale artifacts before rebuilding', async () => {
  await mkdir(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale'), { recursive: true });
  await writeFile(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale', 'old.mjs'), 'stale');

  try {
    await buildServerArtifacts({ artifacts: [migrationArtifact] });
    assert.equal(await exists(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale', 'old.mjs')), false);
    assert.equal(await exists(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'migration', 'index.mjs')), true);
  } finally {
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
  }
});

test('cleans output when an entrypoint is missing', async () => {
  await assert.rejects(
    buildServerArtifacts({
      artifacts: [{ name: 'broken', entryPoint: 'scripts/does-not-exist.ts' }],
    }),
    /Failed to build broken server artifact/,
  );
  assert.equal(await exists(SERVER_ARTIFACT_OUTPUT_ROOT), false);
});

test('migration artifact resolves its adjacent drizzle asset directory', async () => {
  try {
    await buildServerArtifacts({ artifacts: [migrationArtifact] });
    const runtimePackage = JSON.parse(
      await readFile(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'migration/runtime-package.json'), 'utf8'),
    );
    for (const dependency of Object.keys(runtimePackage.dependencies)) {
      const target = join(SERVER_ARTIFACT_OUTPUT_ROOT, 'node_modules', dependency);
      await mkdir(dirname(target), { recursive: true });
      await symlink(join(workspaceRoot, 'packages/core/node_modules', dependency), target, 'dir');
    }
    const migrationArtifactPath = pathToFileURL(
      join(SERVER_ARTIFACT_OUTPUT_ROOT, 'migration', 'index.mjs'),
    ).href;
    const { resolveRuntimeMigrationsFolder } = await import(migrationArtifactPath);
    const expected = join(workspaceRoot, 'drizzle');
    const artifactUrl = pathToFileURL(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'migration', 'index.mjs'));

    assert.equal(resolveRuntimeMigrationsFolder(artifactUrl.href), expected);
  } finally {
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
  }
});

test('migration source entry resolves the repository drizzle directory', async () => {
  const entrypointUrl = pathToFileURL(
    join(workspaceRoot, 'packages/core/db/migrate-entry.ts'),
  ).href;
  const tsxLoader = join(workspaceRoot, 'packages/core/node_modules/tsx/dist/loader.mjs');
  const { stdout } = await execFileAsync(process.execPath, [
    '--import',
    tsxLoader,
    '--input-type=module',
    '-e',
    `const module = await import(${JSON.stringify(entrypointUrl)}); process.stdout.write(module.resolveRuntimeMigrationsFolder(${JSON.stringify(entrypointUrl)}));`,
  ]);

  assert.equal(stdout, join(workspaceRoot, 'drizzle'));
});

test('derives an external runtime package from the build graph', async () => {
  const fixtureDirectory = join(workspaceRoot, 'packages/core/db/.server-artifact-test');
  const fixturePath = join(fixtureDirectory, 'runtime-dependency.ts');
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(fixturePath, "import { z } from 'zod'; export const value = z.string();\n");

  try {
    const manifest = await buildServerArtifacts({
      artifacts: [
        {
          name: 'runtime-dependency-fixture',
          entryPoint: 'packages/core/db/.server-artifact-test/runtime-dependency.ts',
        },
      ],
    });
    const [artifact] = manifest.artifacts;
    assert.match(artifact.runtimeDependencies.zod, /^4\./u);
    const runtimePackage = JSON.parse(
      await readFile(
        join(SERVER_ARTIFACT_OUTPUT_ROOT, 'runtime-dependency-fixture/runtime-package.json'),
        'utf8',
      ),
    );
    assert.deepEqual(runtimePackage.dependencies, artifact.runtimeDependencies);
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
  }
});
