import { describe, expect, test, vi } from 'vitest';
import { loadNextConnectionPage } from './profileConnectionPagination';

type TestEdge = { cursor: string; node: { id: string } };
type TestConnection = {
  edges: TestEdge[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

describe('loadNextConnectionPage', () => {
  test('loads with the provided cursor and appends the returned connection', async () => {
    const current: TestConnection = {
      edges: [{ cursor: 'cursor-1', node: { id: 'node-1' } }],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    };
    const next: TestConnection = {
      edges: [{ cursor: 'cursor-2', node: { id: 'node-2' } }],
      pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
    };
    const load = vi.fn(async () => next);

    await expect(loadNextConnectionPage(current, 'cursor-1', load)).resolves.toEqual({
      connection: {
        edges: [
          { cursor: 'cursor-1', node: { id: 'node-1' } },
          { cursor: 'cursor-2', node: { id: 'node-2' } },
        ],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
      },
      error: false,
    });
    expect(load).toHaveBeenCalledExactlyOnceWith('cursor-1');
  });

  test('returns the existing connection with an error when loading fails', async () => {
    const current: TestConnection = {
      edges: [{ cursor: 'cursor-1', node: { id: 'node-1' } }],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    };
    const load = vi.fn(async () => {
      throw new Error('network failure');
    });

    await expect(loadNextConnectionPage(current, 'cursor-1', load)).resolves.toEqual({
      connection: current,
      error: true,
    });
  });
});
