import * as Sentry from '@sentry/react';
import { createSentryOptions } from './sentry-config';
import type { ErrorInfo } from 'react';

const options = createSentryOptions(process.env);

if (options.enabled) {
  Sentry.init(options);
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (options.enabled) {
    Sentry.captureReactException(cause, info, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  }
};
