import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { buildServerArtifacts, SERVER_ARTIFACT_OUTPUT_ROOT } from './build-server-artifacts.mjs';

const artifacts = ['web', 'api', 'worker', 'fedify-consumer', 'migration'];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('builds the five server artifacts and the Temporal Workflow bundle', async () => {
  await mkdir(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale'), { recursive: true });
  await writeFile(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale/old.mjs'), 'stale');

  try {
    await buildServerArtifacts();

    for (const artifact of artifacts) {
      const directory = join(SERVER_ARTIFACT_OUTPUT_ROOT, artifact);
      const sourceMap = JSON.parse(await readFile(join(directory, 'index.mjs.map'), 'utf8'));
      assert.ok(sourceMap.sourcesContent?.length > 0);
      assert.equal(await exists(join(directory, 'meta.json')), false);
      assert.equal(await exists(join(directory, 'runtime-package.json')), false);
    }

    assert.equal(await exists(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'stale/old.mjs')), false);
    assert.equal(
      await exists(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'worker/workflow-bundle.js')),
      true,
    );

    const api = await readFile(join(SERVER_ARTIFACT_OUTPUT_ROOT, 'api/index.mjs'), 'utf8');
    assert.match(api, /from ["']@temporalio\/client["']/u);
    assert.doesNotMatch(api, /from ["']@kosmo\//u);
  } finally {
    await rm(SERVER_ARTIFACT_OUTPUT_ROOT, { force: true, recursive: true });
  }
});
