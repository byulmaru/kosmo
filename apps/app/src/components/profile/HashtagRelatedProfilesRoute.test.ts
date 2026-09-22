import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HashtagNode =
  | {
      __typename: 'Hashtag';
      id: string;
      name: string;
      relatedProfileList: { id: string; name: string };
    }
  | { __typename: 'Profile'; id: string }
  | null;
type QueryMode = 'error' | 'loading' | 'success';
type ExplorationSession = { sessionId: string; hashtagId?: string };
type ListTrackingProps = {
  onInitialResults?: (hasResults: boolean) => void;
  onPaginationFailure?: () => void;
  onResultSelected?: () => void;
};

const pending = new Promise<never>(() => undefined);
const queryHistory: Array<{ fetchKey: number; variables: { id: string } }> = [];
let hashtagId: string | string[] | undefined = 'hashtag-global-a';
let hashtagNode: HashtagNode = {
  __typename: 'Hashtag',
  id: 'hashtag-global-a',
  name: 'Fediverse',
  relatedProfileList: { id: 'hashtag-global-a', name: 'Fediverse' },
};
let queryMode: QueryMode = 'success';
let renderer: ReactTestRenderer | null = null;
let pendingExploration: ExplorationSession | null = null;
let listTrackingProps: ListTrackingProps | undefined;
const consumedExplorations: string[] = [];
const explorationTrackerCalls = {
  end: 0,
  initialFailure: 0,
  initialResults: [] as boolean[],
  paginationFailure: 0,
  resultSelected: 0,
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ hashtagId }),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    assert.match(parts.join(''), /query HashtagRelatedProfilesPageQuery/);
    return 'HashtagRelatedProfilesPageQuery';
  },
  useLazyLoadQuery: (query: string, variables: { id: string }, options: { fetchKey: number }) => {
    assert.equal(query, 'HashtagRelatedProfilesPageQuery');
    queryHistory.push({ fetchKey: options.fetchKey, variables });

    if (queryMode === 'loading') {
      throw pending;
    }
    if (queryMode === 'error') {
      throw new Error('hashtag related profiles query failed');
    }

    return { node: hashtagNode };
  },
});
mockModule(new URL('./HashtagRelatedProfileList.tsx', import.meta.url), {
  HashtagRelatedProfileList: ({
    hashtag,
    ...tracking
  }: { hashtag: { id: string; name: string } } & ListTrackingProps) => {
    listTrackingProps = tracking;
    return createElement('HashtagRelatedProfileList', {
      identity: hashtag.id,
      name: hashtag.name,
    });
  },
  HashtagRelatedProfileListState: ({ onRetry, state }: { onRetry?: () => void; state: string }) =>
    createElement('HashtagRelatedProfileListState', { onRetry, state }),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => 'actor-a',
});
mockModule(new URL('../../analytics/profileHashtagExploration.ts', import.meta.url), {
  consumeProfileHashtagExploration: (id: string) => {
    consumedExplorations.push(id);
    const session = pendingExploration;
    pendingExploration = null;
    return session;
  },
  createProfileHashtagExplorationTracker: () => ({
    end: () => {
      explorationTrackerCalls.end += 1;
    },
    recordInitialFailure: () => {
      explorationTrackerCalls.initialFailure += 1;
    },
    recordInitialResults: (hasResults: boolean) => {
      explorationTrackerCalls.initialResults.push(hasResults);
    },
    recordPaginationFailure: () => {
      explorationTrackerCalls.paginationFailure += 1;
    },
    recordResultSelected: () => {
      explorationTrackerCalls.resultSelected += 1;
    },
  }),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let HashtagRelatedProfilesScreen: ComponentType | null = null;

before(async () => {
  const module = await import('../../app/(tabs)/(protected)/hashtags/[hashtagId]/profiles').catch(
    () => null,
  );
  HashtagRelatedProfilesScreen = module?.default ?? null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  hashtagId = 'hashtag-global-a';
  hashtagNode = {
    __typename: 'Hashtag',
    id: 'hashtag-global-a',
    name: 'Fediverse',
    relatedProfileList: { id: 'hashtag-global-a', name: 'Fediverse' },
  };
  queryHistory.length = 0;
  queryMode = 'success';
  pendingExploration = null;
  listTrackingProps = undefined;
  consumedExplorations.length = 0;
  explorationTrackerCalls.end = 0;
  explorationTrackerCalls.initialFailure = 0;
  explorationTrackerCalls.initialResults.length = 0;
  explorationTrackerCalls.paginationFailure = 0;
  explorationTrackerCalls.resultSelected = 0;
});

async function renderScreen() {
  const Screen = HashtagRelatedProfilesScreen;
  assert.ok(Screen, 'HashtagRelatedProfilesScreen must exist');

  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Screen));
    } else {
      renderer = create(createElement(Screen));
    }
  });
  assert.ok(renderer);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('hashtag related profiles route identity and lifecycle', () => {
  it('path의 exact Hashtag ID만 Node query와 목록에 전달한다', async () => {
    await renderScreen();

    assert.deepEqual(queryHistory.at(-1), {
      fetchKey: 0,
      variables: { id: 'hashtag-global-a' },
    });
    assert.deepEqual(requireRendered('HashtagRelatedProfileList').props, {
      identity: 'hashtag-global-a',
      name: 'Fediverse',
    });
  });

  it('accepted entry의 session을 결과/선택 callback에 연결하고 route 종료 시 닫는다', async () => {
    pendingExploration = { hashtagId: 'hashtag-global-a', sessionId: 'session-a' };
    await renderScreen();

    assert.deepEqual(consumedExplorations, ['hashtag-global-a']);
    assert.ok(listTrackingProps);
    await act(async () => listTrackingProps?.onInitialResults?.(true));
    await act(async () => listTrackingProps?.onResultSelected?.());
    await act(async () => renderer?.unmount());
    renderer = null;

    assert.deepEqual(explorationTrackerCalls.initialResults, [true]);
    assert.equal(explorationTrackerCalls.resultSelected, 1);
    assert.equal(explorationTrackerCalls.end, 1);
  });

  it('첫 요청 중에는 관련 Profile 맥락을 유지한다', async () => {
    queryMode = 'loading';
    await renderScreen();

    const state = requireRendered('HashtagRelatedProfileListState');
    assert.equal(state.props.state, 'loading');
  });

  it('현재 Hashtag query error만 새 fetchKey로 재시도한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      const state = requireRendered('HashtagRelatedProfileListState');
      assert.equal(state.props.state, 'error');

      queryMode = 'success';
      await act(async () => state.props.onRetry());

      assert.equal(queryHistory.at(-1)?.fetchKey, 1);
      assert.equal(requireRendered('HashtagRelatedProfileList').props.identity, 'hashtag-global-a');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('없는 Node와 Hashtag가 아닌 Node는 관계 목록으로 대체하지 않는다', async () => {
    hashtagNode = null;
    await renderScreen();
    assert.equal(requireRendered('HashtagRelatedProfileListState').props.state, 'notFound');

    hashtagNode = { __typename: 'Profile', id: 'profile-a' };
    await renderScreen();
    assert.equal(requireRendered('HashtagRelatedProfileListState').props.state, 'notFound');
    assert.deepEqual(rendered('HashtagRelatedProfileList'), []);
  });

  it('유효한 단일 path ID가 없으면 Node query를 실행하지 않는다', async () => {
    hashtagId = ['hashtag-a', 'hashtag-b'];
    await renderScreen();

    assert.deepEqual(queryHistory, []);
    assert.equal(requireRendered('HashtagRelatedProfileListState').props.state, 'notFound');
  });

  it('Hashtag ID가 바뀌면 이전 retry state를 재사용하지 않는다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      queryMode = 'success';
      await act(async () => requireRendered('HashtagRelatedProfileListState').props.onRetry());
      assert.equal(queryHistory.at(-1)?.fetchKey, 1);

      hashtagId = 'hashtag-global-b';
      hashtagNode = {
        __typename: 'Hashtag',
        id: 'hashtag-global-b',
        name: '개발',
        relatedProfileList: { id: 'hashtag-global-b', name: '개발' },
      };
      await renderScreen();

      assert.deepEqual(queryHistory.at(-1), {
        fetchKey: 0,
        variables: { id: 'hashtag-global-b' },
      });
      assert.equal(requireRendered('HashtagRelatedProfileList').props.identity, 'hashtag-global-b');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
