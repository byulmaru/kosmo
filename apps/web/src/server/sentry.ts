import * as Sentry from '@sentry/node';
import type { NotificationEffectErrorContext } from '@kosmo/core/services';
import type { InboundCaptureContext } from '@kosmo/fedify';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.ENVIRONMENT;
const release = process.env.SENTRY_RELEASE;
const enabled = Boolean(dsn && environment && release);

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    environment,
    initialScope: { tags: { runtime: 'web-bff' } },
    release,
    sendDefaultPii: false,
  });
}

export const captureUnexpectedError = (cause: unknown, context?: InboundCaptureContext): void => {
  if (!enabled) {
    return;
  }

  if (!context) {
    Sentry.captureException(cause);
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTags(context.tags);
    scope.setFingerprint(context.fingerprint);
    if (context.extra) {
      scope.setExtras(context.extra);
    }
    Sentry.captureException(cause);
  });
};

export const captureNotificationEffectError = (
  cause: unknown,
  context: NotificationEffectErrorContext,
): void => {
  if (enabled) {
    Sentry.withScope((scope) => {
      scope.setTag('operation', context.operation);
      scope.setTag('notificationKind', context.notificationKind);
      scope.setExtra('sourceId', context.sourceId);
      Sentry.captureException(cause);
    });
  }
};
