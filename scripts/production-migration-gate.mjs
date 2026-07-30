import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PHASES = new Set(['expand', 'transition', 'contract']);
const CONTRACT_ROLES = new Set(['active', 'preview', 'rollback']);
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$/;
const WAL_PATTERN = /^[0-9A-F]{24}$/;
const LSN_PATTERN = /^[0-9A-F]+\/[0-9A-F]{8}$/;
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class MigrationGateError extends Error {}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MigrationGateError(`${field} is required`);
  }
  return value;
}

function requireTimestamp(value, field) {
  requireString(value, field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new MigrationGateError(`${field} must be an ISO-8601 timestamp`);
  }
  return timestamp;
}

function requireDigestImage(value, field) {
  requireString(value, field);
  if (!IMAGE_PATTERN.test(value)) {
    throw new MigrationGateError(`${field} must use repository@sha256:<64 lowercase hex>`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new MigrationGateError(`${field} must be boolean`);
  }
  return value;
}

function assertSameReleaseIdentity(context) {
  const releaseImage = requireDigestImage(context.releaseImage, 'releaseImage');
  for (const field of ['migrationImage', 'apiImage', 'webImage']) {
    const image = requireDigestImage(context[field], field);
    if (image !== releaseImage) {
      throw new MigrationGateError(`${field} does not match releaseImage`);
    }
  }

  if (context.retryOf !== undefined) {
    const retryImage = requireDigestImage(context.retryOf.releaseImage, 'retryOf.releaseImage');
    if (retryImage !== releaseImage) {
      throw new MigrationGateError('retryOf.releaseImage does not match releaseImage');
    }
  }
}

function assertRecoveryEvidence(contract, now) {
  const recovery = contract.recovery;
  if (typeof recovery !== 'object' || recovery === null) {
    throw new MigrationGateError('contract.recovery is required');
  }

  const windowStart = requireTimestamp(
    recovery.recoveryWindowStartsAt,
    'contract.recovery.recoveryWindowStartsAt',
  );
  const backupCompletedAt = requireTimestamp(
    recovery.baseBackup?.completedAt,
    'contract.recovery.baseBackup.completedAt',
  );
  if (windowStart > now || now - windowStart > RECOVERY_WINDOW_MS) {
    throw new MigrationGateError('contract.recovery.recoveryWindowStartsAt must be within 7 days');
  }
  if (recovery.baseBackup?.status !== 'completed') {
    throw new MigrationGateError('contract.recovery.baseBackup.status must be completed');
  }
  if (backupCompletedAt < windowStart) {
    throw new MigrationGateError('contract.recovery.baseBackup is outside the recovery window');
  }
  if (
    requireBoolean(recovery.walChain?.continuous, 'contract.recovery.walChain.continuous') !== true
  ) {
    throw new MigrationGateError('contract.recovery.walChain is not continuous');
  }

  const rehearsal = recovery.restoreRehearsal;
  if (rehearsal?.status !== 'succeeded') {
    throw new MigrationGateError('contract.recovery.restoreRehearsal.status must be succeeded');
  }
  requireString(rehearsal.evidenceRef, 'contract.recovery.restoreRehearsal.evidenceRef');
  if (requireBoolean(rehearsal.overdue, 'contract.recovery.restoreRehearsal.overdue')) {
    throw new MigrationGateError('contract.recovery.restoreRehearsal is overdue');
  }

  const recoveryTarget = recovery.recoveryTarget;
  const capturedAt = requireTimestamp(
    recoveryTarget?.capturedAt,
    'contract.recovery.recoveryTarget.capturedAt',
  );
  if (capturedAt > now) {
    throw new MigrationGateError('contract.recovery.recoveryTarget.capturedAt is in the future');
  }
  const targetLsn = requireString(
    recoveryTarget?.targetLsn,
    'contract.recovery.recoveryTarget.targetLsn',
  );
  if (!LSN_PATTERN.test(targetLsn)) {
    throw new MigrationGateError(
      'contract.recovery.recoveryTarget.targetLsn must be an uppercase PostgreSQL LSN',
    );
  }
  const targetWal = requireString(
    recoveryTarget?.targetWal,
    'contract.recovery.recoveryTarget.targetWal',
  );
  const archiveEvidence = recoveryTarget?.archiveEvidence;
  const archivedWal = requireString(
    archiveEvidence?.wal,
    'contract.recovery.recoveryTarget.archiveEvidence.wal',
  );
  if (!WAL_PATTERN.test(targetWal) || !WAL_PATTERN.test(archivedWal)) {
    throw new MigrationGateError(
      'recovery target WAL names must be 24 uppercase hexadecimal characters',
    );
  }
  if (archiveEvidence?.status !== 'verified') {
    throw new MigrationGateError(
      'contract.recovery.recoveryTarget.archiveEvidence.status must be verified',
    );
  }
  requireString(
    archiveEvidence.evidenceRef,
    'contract.recovery.recoveryTarget.archiveEvidence.evidenceRef',
  );
  const archiveVerifiedAt = requireTimestamp(
    archiveEvidence.verifiedAt,
    'contract.recovery.recoveryTarget.archiveEvidence.verifiedAt',
  );
  if (archiveVerifiedAt < capturedAt || archiveVerifiedAt > now) {
    throw new MigrationGateError(
      'contract.recovery.recoveryTarget.archiveEvidence.verifiedAt is outside the valid window',
    );
  }
  if (archivedWal !== targetWal) {
    throw new MigrationGateError('recovery target WAL does not match archive evidence');
  }
  return capturedAt;
}

function assertWorkloadCompatibility(contract, now, recoveryTargetCapturedAt) {
  if (contract.workloadObservation?.source !== 'kubernetes-live') {
    throw new MigrationGateError('contract.workloadObservation.source must be kubernetes-live');
  }
  const observedAt = requireTimestamp(
    contract.workloadObservation.observedAt,
    'contract.workloadObservation.observedAt',
  );
  if (observedAt > now) {
    throw new MigrationGateError('contract.workloadObservation.observedAt is in the future');
  }
  if (observedAt < recoveryTargetCapturedAt) {
    throw new MigrationGateError('contract workload observation predates the recovery target');
  }

  if (!Array.isArray(contract.compatibleImages) || contract.compatibleImages.length === 0) {
    throw new MigrationGateError('contract.compatibleImages must not be empty');
  }
  const compatibleImages = new Set(
    contract.compatibleImages.map((image, index) =>
      requireDigestImage(image, `contract.compatibleImages[${index}]`),
    ),
  );

  const workloads = contract.workloadObservation.workloads;
  if (!Array.isArray(workloads) || workloads.length === 0) {
    throw new MigrationGateError('contract.workloadObservation.workloads must not be empty');
  }
  if (!workloads.some((workload) => workload.role === 'active')) {
    throw new MigrationGateError(
      'contract.workloadObservation.workloads must include an active workload',
    );
  }

  for (const [index, workload] of workloads.entries()) {
    requireString(workload.name, `contract.workloadObservation.workloads[${index}].name`);
    if (!CONTRACT_ROLES.has(workload.role)) {
      throw new MigrationGateError(
        `contract.workloadObservation.workloads[${index}].role is invalid`,
      );
    }
    const image = requireDigestImage(
      workload.image,
      `contract.workloadObservation.workloads[${index}].image`,
    );
    if (!compatibleImages.has(image)) {
      throw new MigrationGateError(`incompatible ${workload.role} workload: ${workload.name}`);
    }
  }

  const rollbackWindowEndsAt = requireTimestamp(
    contract.rollbackWindowEndsAt,
    'contract.rollbackWindowEndsAt',
  );
  if (now < rollbackWindowEndsAt) {
    throw new MigrationGateError('contract rollback window has not ended');
  }
}

export function validateMigrationGate(context, options = {}) {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    throw new MigrationGateError('gate context must be an object');
  }

  const phase = requireString(context.phase, 'phase');
  if (!PHASES.has(phase)) {
    throw new MigrationGateError('phase must be expand, transition, or contract');
  }
  requireString(context.schemaAuthority, 'schemaAuthority');
  assertSameReleaseIdentity(context);

  if (phase === 'contract') {
    if (typeof context.contract !== 'object' || context.contract === null) {
      throw new MigrationGateError('contract evidence is required for contract phase');
    }
    const now = options.now instanceof Date ? options.now.getTime() : Date.now();
    const recoveryTargetCapturedAt = assertRecoveryEvidence(context.contract, now);
    assertWorkloadCompatibility(context.contract, now, recoveryTargetCapturedAt);
  }

  return {
    gatePassed: true,
    phase,
    releaseImage: context.releaseImage,
    schemaAuthority: context.schemaAuthority,
  };
}

export function validateMigrationCompletion(context, migrationResult, options = {}) {
  const gate = validateMigrationGate(context, options);
  if (typeof migrationResult !== 'object' || migrationResult === null) {
    throw new MigrationGateError('migration result is required');
  }
  if (migrationResult.releaseImage !== gate.releaseImage) {
    throw new MigrationGateError(
      'migration result releaseImage does not match the approved release',
    );
  }
  if (migrationResult.phase !== gate.phase) {
    throw new MigrationGateError('migration result phase does not match the approved phase');
  }
  if (migrationResult.schemaAuthority !== gate.schemaAuthority) {
    throw new MigrationGateError(
      'migration result schemaAuthority does not match the approved authority',
    );
  }
  if (migrationResult.status !== 'succeeded') {
    throw new MigrationGateError('migration did not succeed');
  }
  if (migrationResult.databaseRollbackAttempted !== false) {
    throw new MigrationGateError('automatic database rollback is forbidden');
  }

  return {
    workloadActivationAllowed: true,
    phase: gate.phase,
    releaseImage: gate.releaseImage,
    schemaAuthority: gate.schemaAuthority,
  };
}

async function main(argv) {
  const [command, contextPath, resultPath] = argv;
  if (!contextPath || !new Set(['preflight', 'complete']).has(command)) {
    throw new MigrationGateError(
      'usage: production-migration-gate.mjs preflight <context.json> | complete <context.json> <result.json>',
    );
  }
  const context = JSON.parse(await readFile(contextPath, 'utf8'));
  const result =
    command === 'complete'
      ? validateMigrationCompletion(
          context,
          JSON.parse(await readFile(requireString(resultPath, 'result path'), 'utf8')),
        )
      : validateMigrationGate(context);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : 'unknown migration gate failure';
    process.stderr.write(`production migration gate blocked: ${message}\n`);
    process.exitCode = 1;
  });
}
