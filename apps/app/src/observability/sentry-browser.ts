import * as Sentry from '@sentry/react';
import { getPublicConfig } from '@/config/public';
import { RelayTransportError } from '@/relay/transportError';
import type { FeedbackKind } from '@kosmo/core/enums';
import type { ErrorInfo } from 'react';

type FeedbackAttachment = {
  readonly data: string | Uint8Array;
  readonly filename: string;
  readonly contentType?: string;
};

const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const enabled = Boolean(release);

type HandledErrorContext = Readonly<Record<string, string | number | boolean>>;

if (enabled) {
  const channel = getPublicConfig('channel');
  const dsn = getPublicConfig('sentryDsn');

  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    environment: channel,
    initialScope: { tags: { runtime: 'web' } },
    integrations: (integrations) =>
      integrations.filter((integration) => integration.name !== 'BrowserSession'),
    release,
    sendDefaultPii: false,
  });
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (enabled && !(cause instanceof RelayTransportError)) {
    Sentry.captureReactException(cause, info, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  }
};

export const captureHandledError = (error: Error, context?: HandledErrorContext): void => {
  if (!enabled) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }

      Sentry.captureException(error, {
        mechanism: { handled: true, type: 'auto.function.handled_error' },
      });
    });
  } catch {
    // Sentry reporting is best-effort and must not affect the product flow.
  }
};

export const captureHandledMessage = (message: string, context?: HandledErrorContext): void => {
  if (!enabled) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }

      Sentry.captureMessage(message, 'warning');
    });
  } catch {
    // Sentry reporting is best-effort and must not affect the product flow.
  }
};

export const captureFeedback = (
  message: string,
  kind: FeedbackKind,
  attachments: readonly FeedbackAttachment[] = [],
): string => {
  if (!enabled || !Sentry.getClient()) {
    throw new Error('Sentry feedback is not initialized.');
  }

  const eventId = Sentry.captureFeedback(
    { message, tags: { feedback_kind: kind } },
    { attachments: [...attachments] },
  );
  if (!eventId) {
    throw new Error('Sentry feedback was not captured.');
  }
  return eventId;
};
