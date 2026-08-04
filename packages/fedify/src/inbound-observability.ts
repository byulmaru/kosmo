import type { InboxContext } from '@fedify/fedify';

export type InboundActivityType =
  | 'Accept'
  | 'Announce'
  | 'Create'
  | 'Delete'
  | 'Follow'
  | 'Like'
  | 'EmojiReact'
  | 'Reject'
  | 'Undo'
  | 'Update'
  | 'Unknown';

export type InboundHandler =
  | 'accept'
  | 'announce'
  | 'create'
  | 'delete'
  | 'follow'
  | 'reaction'
  | 'reject'
  | 'undo'
  | 'update'
  | 'listener';

export type InboundPhase =
  | 'validation'
  | 'actor_lookup'
  | 'object_lookup'
  | 'protocol'
  | 'projection'
  | 'effect'
  | 'delivery'
  | 'listener';

export type InboundOutcome = 'rejected' | 'noop' | 'external_failure' | 'internal_failure';

export type InboundObservation = {
  activityType: InboundActivityType;
  handler: InboundHandler;
  phase: InboundPhase;
  outcome: InboundOutcome;
  reasonCode: string;
  actorOrigin?: string;
  objectOrigin?: string;
  activityOrigin?: string;
  error?: unknown;
  message?: string;
};

export type InboundCaptureContext = {
  tags: Record<string, string>;
  fingerprint: string[];
  extra?: Record<string, string>;
};

export type InboundObservabilityReporter = {
  log: (observation: Omit<InboundObservation, 'error'>) => void;
  captureException: (error: unknown, context: InboundCaptureContext) => void;
};

const activityTypes = new Set<InboundActivityType>([
  'Accept',
  'Announce',
  'Create',
  'Delete',
  'Follow',
  'Like',
  'EmojiReact',
  'Reject',
  'Undo',
  'Update',
]);

const toOrigin = (value: string | URL | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

const getErrorName = (error: unknown): string | undefined =>
  error instanceof Error && error.name ? error.name : undefined;

const externalErrorNames = new Set([
  'AbortError',
  'FetchError',
  'RemoteActorMaterializationError',
  'SendActivityError',
  'UrlError',
  'WebFingerError',
]);

const defaultReporter: InboundObservabilityReporter = {
  log: (observation) => {
    const log =
      observation.message || observation.outcome === 'internal_failure'
        ? console.error
        : console.warn;
    log(observation.message ?? 'ActivityPub inbound observation', observation);
  },
  captureException: () => undefined,
};

let reporter: InboundObservabilityReporter = defaultReporter;
const observedErrors = new WeakSet<object>();

const canTrackError = (error: unknown): error is object =>
  (typeof error === 'object' && error !== null) || typeof error === 'function';

export const markInboundErrorObserved = (error: unknown): void => {
  if (canTrackError(error)) {
    observedErrors.add(error);
  }
};

export const hasInboundErrorBeenObserved = (error: unknown): boolean =>
  canTrackError(error) && observedErrors.has(error);

export const setInboundObservabilityReporter = (
  next: Partial<InboundObservabilityReporter> | undefined,
): (() => void) => {
  const previous = reporter;
  reporter = {
    log: next?.log ?? defaultReporter.log,
    captureException: next?.captureException ?? defaultReporter.captureException,
  };

  return () => {
    reporter = previous;
  };
};

export const getInboundActivityType = (activity: unknown): InboundActivityType => {
  const name =
    typeof activity === 'object' && activity !== null && 'constructor' in activity
      ? (activity.constructor as { name?: string }).name
      : undefined;
  return name && activityTypes.has(name as InboundActivityType)
    ? (name as InboundActivityType)
    : 'Unknown';
};

export const observeInbound = ({ error, message, ...observation }: InboundObservation): void => {
  const safeObservation = {
    ...observation,
    ...(message ? { message } : {}),
    ...(observation.actorOrigin ? { actorOrigin: toOrigin(observation.actorOrigin) } : {}),
    ...(observation.objectOrigin ? { objectOrigin: toOrigin(observation.objectOrigin) } : {}),
    ...(observation.activityOrigin ? { activityOrigin: toOrigin(observation.activityOrigin) } : {}),
  } satisfies Omit<InboundObservation, 'error'>;

  try {
    reporter.log(safeObservation);
  } catch {
    // Observability must not alter ActivityPub processing.
  }

  if (observation.outcome !== 'internal_failure') {
    return;
  }

  try {
    reporter.captureException(error ?? new Error(observation.reasonCode), {
      tags: {
        activity_type: observation.activityType,
        handler: observation.handler,
        phase: observation.phase,
        outcome: observation.outcome,
        reason_code: observation.reasonCode,
      },
      fingerprint: [
        'activitypub-inbound',
        observation.activityType,
        observation.handler,
        observation.phase,
        observation.reasonCode,
      ],
      extra: {
        ...(safeObservation.actorOrigin ? { actor_origin: safeObservation.actorOrigin } : {}),
        ...(safeObservation.objectOrigin ? { object_origin: safeObservation.objectOrigin } : {}),
        ...(safeObservation.activityOrigin
          ? { activity_origin: safeObservation.activityOrigin }
          : {}),
      },
    });
  } catch {
    // Observability must not alter ActivityPub processing.
  }
};

export const isExternalInboundError = (error: unknown, seen = new Set<object>()): boolean => {
  if (!canTrackError(error) || seen.has(error)) {
    return false;
  }
  seen.add(error);

  const name = getErrorName(error);
  if (name && externalErrorNames.has(name)) {
    return true;
  }

  if (error instanceof Error && 'cause' in error && isExternalInboundError(error.cause, seen)) {
    return true;
  }

  return false;
};

export const withInboundObservability =
  <TContextData, TActivity extends object>(
    handler: InboundHandler,
    listener: (context: InboxContext<TContextData>, activity: TActivity) => void | Promise<void>,
  ) =>
  async (context: InboxContext<TContextData>, activity: TActivity): Promise<void> => {
    try {
      await listener(context, activity);
    } catch (error) {
      markInboundErrorObserved(error);
      observeInbound({
        activityType: getInboundActivityType(activity),
        activityOrigin:
          'id' in activity && activity.id instanceof URL ? activity.id.origin : undefined,
        actorOrigin:
          'actorId' in activity && activity.actorId instanceof URL
            ? activity.actorId.origin
            : undefined,
        objectOrigin:
          'objectId' in activity && activity.objectId instanceof URL
            ? activity.objectId.origin
            : undefined,
        error,
        handler,
        outcome: isExternalInboundError(error) ? 'external_failure' : 'internal_failure',
        phase: 'listener',
        reasonCode: isExternalInboundError(error)
          ? 'external_listener_error'
          : 'unexpected_listener_error',
      });
      throw error;
    }
  };

export const observeInboundNoop = (observation: Omit<InboundObservation, 'outcome'>) =>
  observeInbound({ ...observation, outcome: 'noop' });

export const observeInboundRejected = (observation: Omit<InboundObservation, 'outcome'>) =>
  observeInbound({ ...observation, outcome: 'rejected' });

export const observeInboundExternalFailure = (observation: Omit<InboundObservation, 'outcome'>) =>
  observeInbound({ ...observation, outcome: 'external_failure' });
