import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RouteBoundaryValue = {
  fetchKey: number;
  refetch: () => void;
  retry: () => void;
};

const RouteBoundaryContext = createContext<RouteBoundaryValue>({
  fetchKey: 0,
  refetch: () => undefined,
  retry: () => undefined,
});
const queryHistory: Array<{
  fetchKey: number;
  variables: { postId: string; reactionType: string };
}> = [];
let renderer: ReactTestRenderer | null = null;

mock.module('react-native', {
  exports: {
    Modal: 'Modal',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T>(styles: T) => styles },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) => {
      assert.match(parts.join(''), /query ReactionProfilesModalQuery/);
      return 'ReactionProfilesModalQuery';
    },
    useLazyLoadQuery: (
      query: string,
      variables: { postId: string; reactionType: string },
      options: { fetchKey: number },
    ) => {
      assert.equal(query, 'ReactionProfilesModalQuery');
      queryHistory.push({
        fetchKey: options.fetchKey,
        variables,
      });
      return {
        node: {
          __typename: 'Post',
          reactionProfileConnection: 'reaction-profile-connection',
        },
      };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/RouteBoundary', {
  exports: {
    RouteBoundary: ({ children }: PropsWithChildren) => {
      const [fetchKey, setFetchKey] = useState(0);
      const retry = () => setFetchKey((key) => key + 1);
      const value = { fetchKey, refetch: retry, retry };

      return createElement(
        RouteBoundaryContext.Provider,
        { value },
        createElement('RouteBoundary', { onRetry: undefined, retry }, children),
      );
    },
    useRouteBoundary: () => useContext(RouteBoundaryContext),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/StateView', {
  exports: { StateView: (props: Record<string, unknown>) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/Tabs', {
  exports: {
    Tab: (props: Record<string, unknown>) => createElement('Tab', props),
    TabList: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
      createElement('TabList', props, children),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: {
    useTheme: () => ({ card: '#fff', border: '#ddd', overlayScrim: '#0008' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/tokens', {
  exports: { radii: { lg: 16 }, spacing: { lg: 24 } },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./ReactionProfileConnection', {
  exports: {
    ReactionProfileConnection: (props: Record<string, unknown>) =>
      createElement('ReactionProfileConnection', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./ReactionProfileList', {
  exports: {
    ReactionProfileList: (props: Record<string, unknown>) =>
      createElement('ReactionProfileList', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let ReactionProfilesModal: (props: {
  onClose: () => void;
  postId: string;
  reactionCounts: ReadonlyArray<Readonly<{ count: number; type: string }>>;
}) => ReactNode;

before(async () => {
  ({ ReactionProfilesModal } = await import('./ReactionProfilesModal'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  queryHistory.length = 0;
});

describe('ReactionProfilesModal RouteBoundary lifecycle', () => {
  it('가까운 RouteBoundary가 소유한 fetchKey로 query를 재시도한다', async () => {
    await renderModal();

    assert.deepEqual(queryHistory.at(-1), {
      fetchKey: 0,
      variables: { postId: 'post-1', reactionType: '❤️' },
    });

    const boundary = requireRendered('RouteBoundary');
    assert.equal(boundary.props.onRetry, undefined);

    await act(async () => boundary.props.retry());

    assert.equal(queryHistory.at(-1)?.fetchKey, 1);
    assert.equal(queryHistory.at(-1)?.variables.postId, 'post-1');
  });
});

async function renderModal() {
  assert.ok(ReactionProfilesModal);
  await act(async () => {
    renderer = create(
      createElement(ReactionProfilesModal, {
        onClose: () => undefined,
        postId: 'post-1',
        reactionCounts: [
          { count: 12, type: '❤️' },
          { count: 7, type: '🎉' },
        ],
      }),
    );
  });
  assert.ok(renderer);
}

function requireRendered(type: string): ReactTestInstance {
  assert.ok(renderer);
  const node = renderer.root.findAll((candidate) => candidate.type === type)[0];
  assert.ok(node, `${type} must be rendered`);
  return node;
}
