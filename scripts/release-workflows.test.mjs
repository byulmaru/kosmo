import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readWorkflow = (name) => readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8');

test('release workflows preserve SHA-tag digest promotion', async () => {
  const [dockerBuild, dev, production] = await Promise.all(
    ['docker-build.yml', 'deploy-dev.yml', 'production-release.yml'].map(readWorkflow),
  );

  assert.match(dockerBuild, /docker\/build-push-action/);
  assert.match(dockerBuild, /type=sha,format=long/);

  assert.match(dev, /workflow_run\.head_sha/);
  assert.match(dev, /:sha-\$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(dev, /imagetools inspect/);
  assert.match(dev, /sha256:\[0-9a-f\]\{64\}/);
  assert.match(dev, /image_digest=.*GITHUB_OUTPUT/);
  assert.match(dev, /-p "version=\$\{TARGET_SHA\}"/);
  assert.match(dev, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);

  assert.match(production, /workflow_id: "docker-build\.yml"/);
  assert.match(production, /event: "push"/);
  assert.match(production, /head_sha: targetSha/);
  assert.match(production, /run\.head_branch === "main"/);
  assert.match(production, /run\.conclusion === "success"/);
  assert.match(production, /No successful main Docker Build run exists for/);
  assert.match(production, /:sha-\$\{\{ steps\.resolve\.outputs\.target_sha \}\}/);
  assert.match(production, /imagetools inspect/);
  assert.match(production, /sha256:\[0-9a-f\]\{64\}/);
  assert.match(production, /image_digest: \$\{\{ steps\.image\.outputs\.image_digest \}\}/);

  const deployStart = production.indexOf('\n  production_deploy:');
  const preflightStart = production.indexOf('\n  canonical_preflight:');
  assert.ok(deployStart >= 0 && preflightStart > deployStart, 'production jobs must exist');
  const approved = production.slice(deployStart, preflightStart);

  assert.match(approved, /needs:\s*canonical_preflight/);
  assert.match(approved, /environment:\s*\n\s*name:\s*prod\b/);
  assert.match(
    approved,
    /IMAGE_DIGEST:\s*\$\{\{\s*needs\.canonical_preflight\.outputs\.image_digest\s*\}\}/,
  );
  assert.match(approved, /-p "imageDigest=\$\{IMAGE_DIGEST\}"/);
  assert.doesNotMatch(
    approved,
    /actions\/checkout|docker\/(?:setup-buildx-action|login-action|metadata-action|build-push-action)|docker build(?:x )?build|imagetools inspect|SENTRY_(?:AUTH_TOKEN|UPLOAD_REQUIRED)|secret-envs|download-artifact|release-manifest/,
  );
});
