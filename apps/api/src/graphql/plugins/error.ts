import { isAsyncIterable } from '@envelop/core';
import { logger } from '@kosmo/logger';
import { dev } from '@kosmo/runtime';
import * as Sentry from '@sentry/node';
import { GraphQLError } from 'graphql';
import type { AsyncIterableIteratorOrValue, ExecutionResult } from '@envelop/core';
import type { Plugin } from 'graphql-yoga';

class UnexpectedError extends GraphQLError {
  public eventId: string;

  constructor(error: Error) {
    const eventId = Sentry.captureException(error);

    super(dev ? error.message : 'Unexpected error', {
      extensions: { type: 'UnexpectedError', code: 'UNEXPECTED_ERROR', eventId },
      originalError: dev ? error : undefined,
    });

    this.eventId = eventId;
  }
}

const transformError = (error: unknown): GraphQLError => {
  if (error instanceof GraphQLError) {
    return error.originalError ? transformError(error.originalError) : error;
  } else if (error instanceof Error) {
    logger.error(`Unexpected error {*}`, { error });
    return new UnexpectedError(error);
  } else {
    logger.error(`Unexpected error {*}`, { error });
    return new UnexpectedError(new Error(String(error)));
  }
};

type ErrorHandlerPayload = { error: unknown; setError: (err: unknown) => void };
const errorHandler = ({ error, setError }: ErrorHandlerPayload) => {
  setError(transformError(error));
};

type ResultHandlerPayload<T> = { result: T; setResult: (result: T) => void };
const resultHandler = ({
  result,
  setResult,
}: ResultHandlerPayload<AsyncIterableIteratorOrValue<ExecutionResult>>) => {
  const handler = ({ result, setResult }: ResultHandlerPayload<ExecutionResult>) => {
    if (result.errors) {
      setResult({
        ...result,
        errors: result.errors.map((error) => transformError(error)),
      });
    }
  };

  if (isAsyncIterable(result)) {
    return { onNext: handler };
  } else {
    handler({ result, setResult });
    return;
  }
};

export const useError = (): Plugin => {
  return {
    onPluginInit: ({ registerContextErrorHandler }) => {
      registerContextErrorHandler(errorHandler);
    },
    onExecute: () => ({
      onExecuteDone: resultHandler,
    }),
    onSubscribe: () => ({
      onSubscribeResult: resultHandler,
      onSubscribeError: errorHandler,
    }),
  };
};
