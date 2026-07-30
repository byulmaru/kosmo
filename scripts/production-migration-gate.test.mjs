import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MigrationGateError,
  validateMigrationCompletion,
  validateMigrationGate,
} from './production-migration-gate.mjs';

const image = `ghcr.io/byulmaru/kosmo@sha256:${'a'.repeat(64)}`;
const oldImage = `ghcr.io/byulmaru/kosmo@sha256:${'b'.repeat(64)}`;
const now = new Date('2026-07-30T00:00:00.000Z');

function baseContext(phase = 'expand') {
  return {
    phase,
    schemaAuthority: 'PROD-700',
    releaseImage: image,
    migrationImage: image,
    apiImage: image,
    webImage: image,
  };
}

function contractContext() {
  return {
    ...baseContext('contract'),
    contract: {
      rollbackWindowEndsAt: '2026-07-29T00:00:00.000Z',
      compatibleImages: [image],
      workloadObservation: {
        source: 'kubernetes-live',
        observedAt: '2026-07-29T23:59:00.000Z',
        workloads: [
          { name: 'kosmo-api-active', role: 'active', image },
          { name: 'kosmo-web-preview', role: 'preview', image },
          { name: 'kosmo-api-rollback', role: 'rollback', image },
        ],
      },
      recovery: {
        recoveryWindowStartsAt: '2026-07-23T00:00:00.000Z',
        baseBackup: { status: 'completed', completedAt: '2026-07-24T00:00:00.000Z' },
        walChain: { continuous: true },
        restoreRehearsal: {
          status: 'succeeded',
          overdue: false,
          evidenceRef: 'PROD-546#restore-2026-07',
        },
        recoveryTarget: {
          capturedAt: '2026-07-29T23:58:00.000Z',
          targetLsn: '0/A0000000',
          targetWal: '00000001000000000000000A',
          archiveEvidence: {
            status: 'verified',
            wal: '00000001000000000000000A',
            verifiedAt: '2026-07-29T23:58:30.000Z',
            evidenceRef: 'PROD-546#wal-00000001000000000000000A',
          },
        },
      },
    },
  };
}

test('expand and transition do not require contract evidence', () => {
  for (const phase of ['expand', 'transition']) {
    assert.deepEqual(validateMigrationGate(baseContext(phase), { now }), {
      gatePassed: true,
      phase,
      releaseImage: image,
      schemaAuthority: 'PROD-700',
    });
  }
});

test('rejects missing authority, unknown phase, mutable images, and digest mismatches', () => {
  const cases = [
    [{ ...baseContext(), schemaAuthority: '' }, /schemaAuthority is required/],
    [{ ...baseContext(), phase: 'destructive' }, /phase must be/],
    [{ ...baseContext(), releaseImage: 'ghcr.io/byulmaru/kosmo:1.2.3' }, /releaseImage must use/],
    [{ ...baseContext(), webImage: oldImage }, /webImage does not match/],
    [
      { ...baseContext(), retryOf: { releaseImage: oldImage } },
      /retryOf.releaseImage does not match/,
    ],
  ];

  for (const [context, expected] of cases) {
    assert.throws(() => validateMigrationGate(context, { now }), expected);
  }
});

test('contract passes with complete automatic evidence and no additional approval', () => {
  assert.equal(validateMigrationGate(contractContext(), { now }).gatePassed, true);
});

test('contract rejects broken recovery and overdue rehearsal without a backup age threshold', () => {
  const brokenWal = contractContext();
  brokenWal.contract.recovery.walChain.continuous = false;
  assert.throws(() => validateMigrationGate(brokenWal, { now }), /walChain is not continuous/);

  const overdue = contractContext();
  overdue.contract.recovery.restoreRehearsal.overdue = true;
  assert.throws(() => validateMigrationGate(overdue, { now }), /restoreRehearsal is overdue/);

  const olderButRecoverable = contractContext();
  olderButRecoverable.contract.recovery.baseBackup.completedAt = '2026-07-23T00:00:00.000Z';
  assert.equal(validateMigrationGate(olderButRecoverable, { now }).gatePassed, true);

  const invalidRecoveryWindow = contractContext();
  invalidRecoveryWindow.contract.recovery.recoveryWindowStartsAt = '2026-07-22T23:59:59.000Z';
  assert.throws(
    () => validateMigrationGate(invalidRecoveryWindow, { now }),
    /recoveryWindowStartsAt must be within 7 days/,
  );
});

test('contract rejects invalid target LSN and mismatched WAL archive evidence', () => {
  const context = contractContext();
  context.contract.recovery.recoveryTarget.targetLsn = 'not-an-lsn';
  assert.throws(
    () => validateMigrationGate(context, { now }),
    /must be an uppercase PostgreSQL LSN/,
  );

  const mismatch = contractContext();
  mismatch.contract.recovery.recoveryTarget.archiveEvidence.wal = '000000010000000000000009';
  assert.throws(() => validateMigrationGate(mismatch, { now }), /does not match archive evidence/);

  const unverified = contractContext();
  unverified.contract.recovery.recoveryTarget.archiveEvidence.status = 'pending';
  assert.throws(() => validateMigrationGate(unverified, { now }), /status must be verified/);
});

test('contract rejects stale compatibility decisions against live workloads', () => {
  const incompatible = contractContext();
  incompatible.contract.workloadObservation.workloads[2].image = oldImage;
  assert.throws(
    () => validateMigrationGate(incompatible, { now }),
    (error) =>
      error instanceof MigrationGateError &&
      error.message === 'incompatible rollback workload: kosmo-api-rollback',
  );

  const openWindow = contractContext();
  openWindow.contract.rollbackWindowEndsAt = '2026-07-31T00:00:00.000Z';
  assert.throws(() => validateMigrationGate(openWindow, { now }), /rollback window has not ended/);

  const observationBeforeRecoveryTarget = contractContext();
  observationBeforeRecoveryTarget.contract.workloadObservation.observedAt =
    '2026-07-29T23:57:59.000Z';
  assert.throws(
    () => validateMigrationGate(observationBeforeRecoveryTarget, { now }),
    /workload observation predates the recovery target/,
  );
});

test('workload activation is allowed only after the same migration succeeds', () => {
  const context = baseContext('transition');
  const result = {
    status: 'succeeded',
    releaseImage: image,
    phase: 'transition',
    schemaAuthority: 'PROD-700',
    databaseRollbackAttempted: false,
  };
  assert.equal(
    validateMigrationCompletion(context, result, { now }).workloadActivationAllowed,
    true,
  );

  for (const invalidResult of [
    { ...result, status: 'failed' },
    { ...result, releaseImage: oldImage },
    { ...result, databaseRollbackAttempted: true },
  ]) {
    assert.throws(() => validateMigrationCompletion(context, invalidResult, { now }));
  }
});
