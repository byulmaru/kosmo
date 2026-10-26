import { configureSync, getConfig } from '@logtape/logtape';
import type { LogRecord, Sink } from '@logtape/logtape';

const inboxCategory = ['fedify', 'federation', 'inbox'];

const inboxEvents = new Map<string, { authReason?: string; event: string; message: string }>([
  [
    'Activity {activityId} is enqueued.',
    { event: 'activity_enqueued', message: 'Fedify enqueued an inbox activity.' },
  ],
  [
    'Activity {activityId} has been processed.',
    { event: 'activity_processed', message: 'Fedify processed an inbox activity.' },
  ],
  [
    'Missing actor.',
    { event: 'missing_actor', message: 'Fedify received an activity with no actor.' },
  ],
  [
    'Failed to enqueue the incoming activity {activityId}:\n{error}',
    { event: 'enqueue_failed', message: 'Fedify failed to enqueue an inbox activity.' },
  ],
  [
    'Unsupported activity type:\n{activity}',
    {
      event: 'unsupported_activity_type',
      message: 'Fedify received an unsupported activity type.',
    },
  ],
  [
    'An unexpected error occurred in inbox error handler:\n{error}',
    { event: 'inbox_error_handler_failed', message: 'Fedify inbox error handling failed.' },
  ],
  [
    'Failed to process the incoming activity {activityId}:\n{error}',
    { event: 'activity_processing_failed', message: 'Fedify failed to process an inbox activity.' },
  ],
  [
    "Failed to verify the request's HTTP Signatures.",
    {
      event: 'signature_verification_failed',
      message: 'Fedify could not verify an inbox signature.',
    },
  ],
  [
    'The activity {activityId} of the portable actor {actorId} is not authenticated by a valid Object Integrity Proof.',
    {
      authReason: 'proofPolicy',
      event: 'portable_actor_proof_missing',
      message: 'Fedify rejected an unauthenticated portable actor activity.',
    },
  ],
  [
    'The portable activity {activityId} is not authenticated by an Object Integrity Proof of its own DID: {reason}',
    {
      event: 'portable_activity_proof_rejected',
      message: 'Fedify rejected a portable activity without a valid proof from its own DID.',
    },
  ],
  [
    'The signer ({keyId}) and the actor ({actorId}) do not match.',
    {
      authReason: 'actorKeyMismatch',
      event: 'signature_actor_mismatch',
      message: 'Fedify rejected a signature whose signer does not match the activity actor.',
    },
  ],
  [
    'Failed to verify compound portable Object Integrity Proofs.',
    {
      authReason: 'proofPolicy',
      event: 'compound_proof_rejected',
      message: 'Fedify could not verify compound portable object integrity proofs.',
    },
  ],
  [
    'Signature nonce verification failed (missing, expired, or replayed).',
    {
      authReason: 'invalidNonce',
      event: 'signature_nonce_rejected',
      message: 'Fedify rejected a missing, expired, or replayed signature nonce.',
    },
  ],
]);

const authReasons = new Set([
  'invalidGateways',
  'invalidJsonTree',
  'invalidPortableObject',
  'invalidProof',
  'keyFetchError',
  'limitExceeded',
  'missingContext',
  'missingProof',
  'noSignature',
  'notPortableObject',
  'signatureVerificationFailed',
  'unsecuredCollection',
  'unsupportedObjectType',
  'unsupportedProofShape',
  'unsupportedVerificationMethod',
  'verificationMethodMismatch',
  'invalidSignature',
]);

const httpOrigin = (value: unknown): string | undefined => {
  try {
    const url = value instanceof URL ? value : typeof value === 'string' ? new URL(value) : null;
    return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

const projectRecord = (record: LogRecord): Record<string, unknown> => {
  // shortcut: unknown Fedify templates stay generic; extend this map when their diagnostics are needed.
  const event =
    typeof record.rawMessage === 'string' ? inboxEvents.get(record.rawMessage) : undefined;
  const projected: Record<string, unknown> = {
    category: record.category,
    event: event?.event ?? 'unknown',
    level: record.level,
    timestamp: record.timestamp,
  };

  if (event) {
    projected.message = event.message;
    if (event.authReason) {
      projected.authReason = event.authReason;
    }
  }

  const activityOriginClaimed = httpOrigin(record.properties.activityId);
  const keyOriginUnverified = httpOrigin(record.properties.keyId);
  if (activityOriginClaimed) {
    projected.activityOriginClaimed = activityOriginClaimed;
  }
  if (keyOriginUnverified) {
    projected.keyOriginUnverified = keyOriginUnverified;
  }

  const reason = record.properties.reason;
  if (typeof reason === 'string' && authReasons.has(reason)) {
    projected.authReason = reason;
  }

  return projected;
};

const jsonSink: Sink = (record) => console.log(JSON.stringify(projectRecord(record)));

export const configureFedifyInboxLogging = (): void => {
  if (getConfig()) {
    return;
  }

  configureSync({
    sinks: { json: jsonSink },
    filters: {
      sampleInfo: (record) => record.level !== 'info' || Math.random() < 0.01,
    },
    loggers: [
      { category: 'logtape', sinks: ['json'], lowestLevel: 'warning' },
      {
        category: inboxCategory,
        sinks: ['json'],
        filters: ['sampleInfo'],
        lowestLevel: 'info',
      },
    ],
  });
};
