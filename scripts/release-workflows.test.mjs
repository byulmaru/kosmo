import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readWorkflow = (name) => readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8');

const productionDeployJob = (workflow) => {
  const match = workflow.match(/\n {2}production_deploy:\n([\s\S]*?)(?=\n {2}[a-z_]+:|$)/);
  assert.ok(match, 'production_deploy job must exist');
  return match[1];
};

test('Docker Build publishes a full-SHA tag without a digest manifest', async () => {
  const workflow = await readWorkflow('docker-build.yml');

  assert.match(workflow, /docker\/build-push-action/);
  assert.match(workflow, /type=sha,format=long/);
  assert.match(workflow, /type=raw,value=main/);
  assert.doesNotMatch(
    workflow,
    /id: build|canonical-release-manifest|release-manifest|docker-image-ref/,
  );
});

test('Dev resolves the triggering full-SHA tag digest before sync', async () => {
  const workflow = await readWorkflow('deploy-dev.yml');

  assert.match(
    workflow,
    /permissions:\n {2}contents: read\n {2}id-token: write\n {2}packages: read/,
  );
  assert.match(workflow, /TARGET_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /docker\/setup-buildx-action/);
  assert.match(workflow, /docker\/login-action/);
  assert.match(
    workflow,
    /IMAGE_REFERENCE: ghcr\.io\/\$\{\{ github\.repository \}\}:sha-\$\{\{ github\.event\.workflow_run\.head_sha \}\}/,
  );
  assert.match(workflow, /docker buildx imagetools inspect "\$\{IMAGE_REFERENCE\}"/);
  assert.match(workflow, /--format '\{\{json \.Manifest\}\}'/);
  assert.match(workflow, /test\("\^sha256:\[0-9a-f\]\{64\}\$"\)/);
  assert.match(workflow, /echo "image_digest=\$\{image_digest\}" >> "\$\{GITHUB_OUTPUT\}"/);
  assert.match(workflow, /-p "version=\$\{TARGET_SHA\}"/);
  assert.match(workflow, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);
  assert.ok(workflow.indexOf('app set kosmo-dev') < workflow.indexOf('app sync kosmo-dev'));
  assert.doesNotMatch(
    workflow,
    /canonical-release-manifest|release-manifest|download-artifact|runtimeConfig/,
  );
});

test('Trivy uses the triggering full-SHA tag and keeps manual fallback', async () => {
  const workflow = await readWorkflow('trivy-scan.yml');

  assert.match(workflow, /TARGET_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /image_ref="ghcr\.io\/\$\{GITHUB_REPOSITORY\}:sha-\$\{TARGET_SHA\}"/);
  assert.match(workflow, /image_ref="ghcr\.io\/\$\{GITHUB_REPOSITORY\}:main"/);
  assert.match(workflow, /docker\/login-action/);
  assert.match(workflow, /image-ref: \$\{\{ steps\.image\.outputs\.image-ref \}\}/);
  assert.doesNotMatch(
    workflow,
    /canonical-release-manifest|release-manifest|docker-image-ref|download-artifact/,
  );
});

test('Production preflight resolves and validates the SHA tag digest', async () => {
  const workflow = await readWorkflow('production-release.yml');

  assert.match(workflow, /canonical_preflight:/);
  assert.match(workflow, /actions: read\n {6}contents: read\n {6}packages: read/);
  assert.match(workflow, /workflow_id: "docker-build\.yml"/);
  assert.match(workflow, /event: "push"/);
  assert.match(workflow, /status: "completed"/);
  assert.match(workflow, /head_sha: targetSha/);
  assert.match(workflow, /run\.head_branch === "main"/);
  assert.match(workflow, /run\.conclusion === "success"/);
  assert.match(workflow, /canonicalRuns\.length === 0/);
  assert.match(workflow, /No successful main Docker Build run exists for/);
  assert.match(workflow, /docker\/setup-buildx-action/);
  assert.match(workflow, /docker\/login-action/);
  assert.match(
    workflow,
    /IMAGE_REFERENCE: ghcr\.io\/\$\{\{ github\.repository \}\}:sha-\$\{\{ steps\.resolve\.outputs\.target_sha \}\}/,
  );
  assert.match(workflow, /docker buildx imagetools inspect "\$\{IMAGE_REFERENCE\}"/);
  assert.match(workflow, /--format '\{\{json \.Manifest\}\}'/);
  assert.match(workflow, /test\("\^sha256:\[0-9a-f\]\{64\}\$"\)/);
  assert.match(workflow, /image_digest: \$\{\{ steps\.image\.outputs\.image_digest \}\}/);
  assert.match(
    workflow,
    /IMAGE_DIGEST: \$\{\{ needs\.canonical_preflight\.outputs\.image_digest \}\}/,
  );
  assert.match(workflow, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);
  assert.match(workflow, /SHA tag: ghcr\.io\/\$\{GITHUB_REPOSITORY\}:sha-\$\{TARGET_SHA\}/);
  assert.doesNotMatch(
    workflow,
    /canonical-release-manifest|release-manifest|listWorkflowRunArtifacts|download-artifact/,
  );
});

test('Approved production job has no build or registry re-resolution path', async () => {
  const workflow = await readWorkflow('production-release.yml');
  const deployJob = productionDeployJob(workflow);

  assert.doesNotMatch(workflow, /^permissions:\n {2}actions: read/m);
  assert.doesNotMatch(deployJob, /actions: read/);
  assert.doesNotMatch(deployJob, /actions\/checkout/);
  assert.doesNotMatch(
    deployJob,
    /docker\/(setup-buildx-action|login-action|metadata-action|build-push-action)/,
  );
  assert.doesNotMatch(deployJob, /docker buildx imagetools inspect/);
  assert.doesNotMatch(deployJob, /SENTRY_AUTH_TOKEN|SENTRY_UPLOAD_REQUIRED|secret-envs/);
  assert.doesNotMatch(deployJob, /listWorkflowRuns|listWorkflowRunArtifacts|download-artifact/);
  assert.doesNotMatch(deployJob, /packages: write/);
  assert.doesNotMatch(deployJob, /packages: read/);
  assert.match(
    deployJob,
    /CANONICAL_BUILD_RUN_ID: \$\{\{ needs\.canonical_preflight\.outputs\.build_run_id \}\}/,
  );
  assert.match(
    deployJob,
    /IMAGE_DIGEST: \$\{\{ needs\.canonical_preflight\.outputs\.image_digest \}\}/,
  );
  assert.match(deployJob, /SHA tag: ghcr\.io\/\$\{GITHUB_REPOSITORY\}:sha-\$\{TARGET_SHA\}/);
  assert.match(deployJob, /Production image build: not executed/);
});
