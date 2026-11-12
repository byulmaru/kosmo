import { POST_REQUEST_SEARCH_ATTRIBUTES } from '@kosmo/core/temporal/post-request';

const keywordSearchAttribute = (name: string) => ({ name, type: 'KEYWORD' as const });

export const POST_REQUEST_TEST_SEARCH_ATTRIBUTES = [
  keywordSearchAttribute(POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId),
  keywordSearchAttribute(POST_REQUEST_SEARCH_ATTRIBUTES.profileId),
  keywordSearchAttribute(POST_REQUEST_SEARCH_ATTRIBUTES.status),
];
