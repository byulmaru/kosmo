import { dev } from '@kosmo/core';
import { FieldError, KosmoError } from '@kosmo/core/error';
import { GraphQLError } from 'graphql';
import { isAsyncIterable } from 'graphql-yoga';
import type { ExecutionResult, GraphQLErrorExtensions } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

const unwrapKosmoError = (error: unknown): KosmoError | null => {
  if (error instanceof KosmoError) {
    return error;
  }

  if (error instanceof GraphQLError && error.originalError) {
    return unwrapKosmoError(error.originalError);
  }

  return null;
};

const getKosmoErrorExtensions = (error: KosmoError): GraphQLErrorExtensions => ({
  code: error.code,
  ...(error instanceof FieldError && error.field ? { field: error.field } : {}),
});

const createUnexpectedGraphQLError = (error: unknown, graphQLError?: GraphQLError) => {
  const originalError =
    graphQLError?.originalError ?? (error instanceof Error ? error : new Error(String(error)));

  return new GraphQLError(dev ? originalError.message : 'Unexpected error', {
    nodes: graphQLError?.nodes,
    source: graphQLError?.source,
    positions: graphQLError?.positions,
    path: graphQLError?.path,
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
    originalError: dev ? originalError : undefined,
  });
};

const createValidationGraphQLError = (graphQLError: GraphQLError) =>
  new GraphQLError('Invalid input', {
    nodes: graphQLError.nodes,
    source: graphQLError.source,
    positions: graphQLError.positions,
    path: graphQLError.path,
    extensions: {
      code: 'VALIDATION',
    },
  });

const isNativeOidcSessionInputError = (error: GraphQLError) => {
  const isNativeOidcSessionOperation =
    error.source?.body.includes('exchangeNativeOidcSession') === true;
  const isInputCoercionError = /^Variable "\$[^"]+" got invalid value/.test(error.message);
  const isNativeInputValidationError = error.message.includes('ExchangeNativeOidcSessionInput');

  return (isNativeOidcSessionOperation && isInputCoercionError) || isNativeInputValidationError;
};

const transformError = (error: unknown): GraphQLError => {
  const graphQLError = error instanceof GraphQLError ? error : undefined;
  const kosmoError = unwrapKosmoError(error);

  if (kosmoError) {
    return new GraphQLError(kosmoError.message, {
      nodes: graphQLError?.nodes,
      source: graphQLError?.source,
      positions: graphQLError?.positions,
      path: graphQLError?.path,
      extensions: getKosmoErrorExtensions(kosmoError),
      originalError: kosmoError,
    });
  }

  // Variable coercion happens before the mutation resolver. Mask only this
  // public credential-exchange operation so malformed inputs cannot echo code
  // or token values while preserving other GraphQL validation diagnostics.
  if (graphQLError && isNativeOidcSessionInputError(graphQLError)) {
    return createValidationGraphQLError(graphQLError);
  }

  if (graphQLError && !graphQLError.originalError) {
    return graphQLError;
  }

  return createUnexpectedGraphQLError(error, graphQLError);
};

const transformExecutionResult = (result: ExecutionResult): ExecutionResult => {
  if (!result.errors?.length) {
    return result;
  }

  return {
    ...result,
    errors: result.errors.map(transformError),
  };
};

export const useError = (): Plugin<UserContext> => ({
  onPluginInit: ({ registerContextErrorHandler }) => {
    registerContextErrorHandler(({ error, setError }) => {
      setError(transformError(error));
    });
  },
  onExecute: () => ({
    onExecuteDone: ({ result, setResult }) => {
      if (isAsyncIterable(result)) {
        return {
          onNext: ({ result, setResult }) => {
            setResult(transformExecutionResult(result));
          },
        };
      }

      setResult(transformExecutionResult(result));
      return;
    },
  }),
});
