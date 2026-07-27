import type { BrowserOptions, ErrorEvent } from '@sentry/react';

type SentryEnvironment = Readonly<Record<string, string | undefined>>;

const normalizeErrorType = (type: string | undefined) =>
  type && /^[A-Za-z][A-Za-z0-9_. -]{0,79}$/.test(type) ? type : 'Error';

const definedProperties = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, property]) => property !== undefined)) as T;

export const redactSentryEvent = (event: ErrorEvent): ErrorEvent => ({
  debug_meta: event.debug_meta,
  environment: event.environment,
  event_id: event.event_id,
  exception: event.exception
    ? {
        values: event.exception.values?.map((exception) => ({
          ...(exception.mechanism
            ? {
                mechanism: {
                  handled: exception.mechanism.handled,
                  type: exception.mechanism.type,
                },
              }
            : {}),
          stacktrace: exception.stacktrace
            ? {
                frames: exception.stacktrace.frames?.map((frame) =>
                  definedProperties({
                    abs_path: frame.abs_path,
                    addr_mode: frame.addr_mode,
                    colno: frame.colno,
                    debug_id: frame.debug_id,
                    filename: frame.filename,
                    function: frame.function,
                    in_app: frame.in_app,
                    instruction_addr: frame.instruction_addr,
                    lineno: frame.lineno,
                    module: frame.module,
                    platform: frame.platform,
                  }),
                ),
              }
            : undefined,
          type: normalizeErrorType(exception.type),
          value: 'Unhandled error',
        })),
      }
    : undefined,
  level: event.level,
  platform: event.platform,
  release: event.release,
  sdk: event.sdk,
  tags: event.tags?.runtime ? { runtime: event.tags.runtime } : undefined,
  timestamp: event.timestamp,
  type: undefined,
});

export const createSentryOptions = (environment: SentryEnvironment): BrowserOptions => {
  const dsn = environment.EXPO_PUBLIC_SENTRY_DSN;
  const deploymentEnvironment = environment.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  const release = environment.EXPO_PUBLIC_SENTRY_RELEASE;

  return {
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
    dsn,
    enabled:
      environment.EXPO_PUBLIC_SENTRY_ENABLED === '1' &&
      Boolean(dsn && deploymentEnvironment && release),
    environment: deploymentEnvironment,
    initialScope: { tags: { runtime: 'web' } },
    release,
    sendDefaultPii: false,
  };
};
