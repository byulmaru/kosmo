import { describe, expect, test } from 'vitest';
import { appendConnectionPage } from './profileConnectionPagination';

type TestEdge = { cursor: string; node: { id: string } };
type TestConnection = {
  edges: TestEdge[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

describe('appendConnectionPage', () => {
  test('appends new edges and keeps the latest pageInfo', () => {
    const current: TestConnection = {
      edges: [{ cursor: 'cursor-1', node: { id: 'node-1' } }],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    };
    const next: TestConnection = {
      edges: [{ cursor: 'cursor-2', node: { id: 'node-2' } }],
      pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
    };

    expect(appendConnectionPage(current, next)).toEqual({
      edges: [
        { cursor: 'cursor-1', node: { id: 'node-1' } },
        { cursor: 'cursor-2', node: { id: 'node-2' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
    });
  });
});
