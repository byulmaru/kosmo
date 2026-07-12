import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dev 차트는 제한된 PreSync 마이그레이션 Job을 렌더링한다', () => {
  const result = spawnSync('helm', ['template', 'kosmo-dev', 'apps/helm', '--set', 'env=dev'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const job = result.stdout
    .split('---')
    .find((document) => document.includes('database-migration-job.yaml'));

  assert.ok(job, 'the dev chart must render the database migration Job');
  assert.match(job, /argocd\.argoproj\.io\/hook: PreSync/);
  assert.match(job, /argocd\.argoproj\.io\/hook-delete-policy: BeforeHookCreation,HookSucceeded/);
  assert.match(job, /argocd\.argoproj\.io\/sync-wave: "-1"/);
  assert.match(job, /image: "ghcr\.io\/byulmaru\/kosmo:latest"/);
  assert.match(job, /args:\s+- migrate/);
  assert.match(job, /name: DATABASE_URL/);
  assert.match(job, /backoffLimit: 0/);
  assert.match(job, /activeDeadlineSeconds: 600/);
  assert.match(job, /restartPolicy: Never/);
  assert.doesNotMatch(job, /initContainers:/);
});

test('dev가 아닌 차트는 마이그레이션 Job을 렌더링하지 않는다', () => {
  const result = spawnSync('helm', ['template', 'kosmo', 'apps/helm'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /database-migration-job\.yaml/);
});

test('Deploy Dev는 실행을 직렬화하고 전체 sync 후 Rollout을 재시작한다', async () => {
  const workflow = await readFile('.github/workflows/deploy-dev.yml', 'utf8');
  const sync = workflow.indexOf('app sync kosmo-dev --timeout 600');
  const restart = workflow.indexOf('app actions run kosmo-dev restart');

  assert.match(workflow, /cancel-in-progress: false/);
  assert.ok(sync >= 0, 'Deploy Dev must perform a full application sync');
  assert.ok(restart > sync, 'rollout restart must happen after a successful sync');
  assert.doesNotMatch(workflow.slice(sync, restart), /--resource(?:-name)?\b/);
});
