import type { ErrorInfo } from 'react';

export const captureReactError: (cause: unknown, info: ErrorInfo) => void = () => undefined;
