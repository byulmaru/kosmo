import { dev } from '@kosmo/core';
import { FieldError, KosmoError } from '@kosmo/core/error';
import { GraphQLError } from 'graphql';
import { isAsyncIterable } from 'graphql-yoga';
import type { ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

type AsyncIterableIteratorOrValue<T> = AsyncIterableIterator<T> | T;

const unwrapKosmoError = (error: unknown): KosmoError | null => {
  if (error instanceof KosmoError) {
    return error;
  }

  if (error instanceof GraphQLError && error.originalError) {
    return unwrapKosmoError(error.originalError);
  }

  return null;
};

const createKosmoGraphQLError = (error: KosmoError) =>
  new GraphQLError(error.message, {
    extensions: {
      code: error.code,
      ...(error instanceof FieldError && error.field ? { field: error.field } : {}),
    },
    originalError: error,
  });

const createUnexpectedGraphQLError = (error: unknown) => {
  const originalError = error instanceof Error ? error : new Error(String(error));

  return new GraphQLError(dev ? originalError.message : 'Unexpected error', {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
    originalError: dev ? originalError : undefined,
  });
};

const transformError = (error: unknown): GraphQLError => {
  const kosmoError = unwrapKosmoError(error);

  if (kosmoError) {
    return createKosmoGraphQLError(kosmoError);
  }

  if (error instanceof GraphQLError && !error.originalError) {
    return error;
  }

  return createUnexpectedGraphQLError(error);
};

type ErrorHandlerPayload = { error: unknown; setError: (error: unknown) => void };

const contextErrorHandler = ({ error, setError }: ErrorHandlerPayload) => {
  setError(transformError(error));
};

type ResultHandlerPayload<T> = { result: T; setResult: (result: T) => void };

const handleExecutionResult = ({ result, setResult }: ResultHandlerPayload<ExecutionResult>) => {
  if (!result.errors?.length) {
    return;
  }

  setResult({
    ...result,
    errors: result.errors.map(transformError),
  });
};

const resultHandler = ({
  result,
  setResult,
}: ResultHandlerPayload<AsyncIterableIteratorOrValue<ExecutionResult>>) => {
  if (isAsyncIterable(result)) {
    return { onNext: handleExecutionResult };
  }

  handleExecutionResult({ result, setResult });
  return;
};

export const useError = (): Plugin<UserContext> => ({
  onPluginInit: ({ registerContextErrorHandler }) => {
    registerContextErrorHandler(contextErrorHandler);
  },
  onExecute: () => ({
    onExecuteDone: resultHandler,
  }),
});
