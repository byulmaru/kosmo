import { isAggregatedError, isGraphQLError } from '@mearie/svelte';
import type { GraphQLError } from '@mearie/svelte';

export const getFirstGraphQLError = (error: unknown): GraphQLError | null => {
  if (!isAggregatedError(error)) {
    return null;
  }

  for (const operationError of error.errors) {
    if (isGraphQLError(operationError)) {
      return operationError;
    }
  }

  return null;
};
