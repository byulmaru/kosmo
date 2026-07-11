import type { Page } from '@playwright/test';

export type GraphQLOperation = {
  operationName?: string | null;
  query?: string | null;
  variables?: Record<string, unknown> | null;
};

export function readGraphQLOperation(postData: string | null): GraphQLOperation | null {
  if (!postData) {
    return null;
  }

  try {
    return JSON.parse(postData) as GraphQLOperation;
  } catch {
    return null;
  }
}

export const isGraphQLOperation = (postData: string | null, operationName: string) =>
  readGraphQLOperation(postData)?.operationName === operationName;

export const waitForGraphQLOperation = (page: Page, operationName: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      isGraphQLOperation(response.request().postData(), operationName),
  );
