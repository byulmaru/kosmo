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

test('Docker Build publishes one validated canonical digest manifest', async () => {
  const workflow = await readWorkflow('docker-build.yml');

  assert.match(workflow, /id: build[\s\S]*?docker\/build-push-action/);
  assert.match(workflow, /IMAGE_DIGEST: \$\{\{ steps\.build\.outputs\.digest \}\}/);
  assert.match(workflow, /Create canonical release manifest/);
  assert.match(workflow, /\{imageDigest: \$image_digest\}/);
  assert.match(workflow, /name: canonical-release-manifest/);
  assert.match(workflow, /path: release-manifest\.json/);
  assert.match(workflow, /retention-days: 90/);
  assert.equal([...workflow.matchAll(/name: canonical-release-manifest/g)].length, 1);
  assert.doesNotMatch(workflow, /docker-image-ref|outputs:\n\s+image_digest:/);
});

test('Dev consumes the triggering Docker Build digest before sync', async () => {
  const workflow = await readWorkflow('deploy-dev.yml');

  assert.match(workflow, /permissions:\n {2}actions: read/);
  assert.match(workflow, /TARGET_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /name: canonical-release-manifest/);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /\.imageDigest/);
  assert.match(workflow, /-p "version=\$\{TARGET_SHA\}"/);
  assert.match(workflow, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);
  assert.ok(workflow.indexOf('app set kosmo-dev') < workflow.indexOf('app sync kosmo-dev'));
  assert.doesNotMatch(workflow, /runtimeConfig/);
});

test('Trivy consumes the triggering Docker Build manifest', async () => {
  const workflow = await readWorkflow('trivy-scan.yml');

  assert.match(workflow, /name: canonical-release-manifest/);
  assert.match(workflow, /path: canonical-release-manifest/);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /manifest_path="canonical-release-manifest\/release-manifest\.json"/);
  assert.match(workflow, /\.imageDigest/);
  assert.match(workflow, /image_ref="ghcr\.io\/\$\{GITHUB_REPOSITORY\}@\$\{IMAGE_DIGEST\}"/);
  assert.match(workflow, /image-ref: \$\{\{ steps\.image\.outputs\.image-ref \}\}/);
  assert.doesNotMatch(workflow, /docker-image-ref/);
});

test('Production preflight pins one successful main Docker Build artifact', async () => {
  const workflow = await readWorkflow('production-release.yml');

  assert.match(workflow, /canonical_preflight:/);
  assert.match(workflow, /workflow_id: "docker-build\.yml"/);
  assert.match(workflow, /event: "push"/);
  assert.match(workflow, /status: "completed"/);
  assert.match(workflow, /head_sha: targetSha/);
  assert.match(workflow, /run\.head_branch === "main"/);
  assert.match(workflow, /run\.conclusion === "success"/);
  assert.match(workflow, /canonicalRuns\.length !== 1/);
  assert.match(workflow, /artifact\.name === "canonical-release-manifest"/);
  assert.match(workflow, /manifestArtifacts\.length !== 1 \|\| manifestArtifacts\[0\]\.expired/);
  assert.match(workflow, /run-id: \$\{\{ steps\.resolve\.outputs\.build_run_id \}\}/);
  assert.match(workflow, /image_digest: \$\{\{ steps\.manifest\.outputs\.image_digest \}\}/);
  assert.match(
    workflow,
    /IMAGE_DIGEST: \$\{\{ needs\.canonical_preflight\.outputs\.image_digest \}\}/,
  );
  assert.match(workflow, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);
  assert.doesNotMatch(workflow, /image_reference/);
});

test('Approved production job has no build or artifact re-resolution path', async () => {
  const workflow = await readWorkflow('production-release.yml');
  const deployJob = productionDeployJob(workflow);

  assert.doesNotMatch(workflow, /^permissions:\n {2}actions: read/m);
  assert.doesNotMatch(deployJob, /actions: read/);
  assert.doesNotMatch(deployJob, /actions\/checkout/);
  assert.doesNotMatch(
    deployJob,
    /docker\/(setup-buildx-action|login-action|metadata-action|build-push-action)/,
  );
  assert.doesNotMatch(deployJob, /SENTRY_AUTH_TOKEN|SENTRY_UPLOAD_REQUIRED|secret-envs/);
  assert.doesNotMatch(deployJob, /listWorkflowRuns|listWorkflowRunArtifacts|download-artifact/);
  assert.doesNotMatch(deployJob, /packages: write/);
  assert.match(
    deployJob,
    /CANONICAL_BUILD_RUN_ID: \$\{\{ needs\.canonical_preflight\.outputs\.build_run_id \}\}/,
  );
  assert.match(
    deployJob,
    /IMAGE_DIGEST: \$\{\{ needs\.canonical_preflight\.outputs\.image_digest \}\}/,
  );
  assert.match(deployJob, /Production image build: not executed/);
});
