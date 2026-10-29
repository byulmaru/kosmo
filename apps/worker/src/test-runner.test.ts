import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { discoverTestFiles } from './test-runner';

test('discovers new tests into deterministic groups and ignores non-test fixtures', () => {
  const sourceDirectory = mkdtempSync(join(tmpdir(), 'worker-test-discovery-'));

  try {
    const files = [
      'post-create.workflow.test.ts',
      'new-unit.test.ts',
      'activities/cleanup-unavailable-notifications.database.test.ts',
      'remote-profile-materialization.workflow.database.test.ts',
      'profile-migration-activities.native-database.test.ts',
      'test-fixtures/post-create.ts',
    ];

    for (const file of files) {
      const filePath = join(sourceDirectory, file);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '');
    }

    assert.deepEqual(discoverTestFiles(sourceDirectory), {
      unit: ['new-unit.test.ts'],
      workflow: ['post-create.workflow.test.ts'],
      database: [
        'activities/cleanup-unavailable-notifications.database.test.ts',
        'remote-profile-materialization.workflow.database.test.ts',
      ],
      'native-database': ['profile-migration-activities.native-database.test.ts'],
    });
  } finally {
    rmSync(sourceDirectory, { force: true, recursive: true });
  }
});
