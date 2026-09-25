import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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

const pending = new Promise<never>(() => undefined);
const require = createRequire(import.meta.url);
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
let routerCanGoBack = true;
let routerBackCount = 0;
const routerReplacements: string[] = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ hashtagId }),
  useRouter: () => ({
    back: () => {
      routerBackCount += 1;
    },
    canGoBack: () => routerCanGoBack,
    replace: (href: string) => routerReplacements.push(href),
  }),
});
mockModule('lucide-react-native', {
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
});
mockModule(require.resolve('lucide-react-native'), {
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule('@/components/ui/IconButton', {
  IconButton: (props: object) => createElement('IconButton', props),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: 'foreground' }),
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
    leading,
  }: {
    hashtag: { id: string; name: string };
    leading?: unknown;
  }) =>
    createElement('HashtagRelatedProfileList', {
      identity: hashtag.id,
      leading,
      name: hashtag.name,
    }),
  HashtagRelatedProfileListState: ({
    leading,
    onRetry,
    state,
  }: {
    leading?: unknown;
    onRetry?: () => void;
    state: string;
  }) => createElement('HashtagRelatedProfileListState', { leading, onRetry, state }),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => 'actor-a',
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
  routerBackCount = 0;
  routerCanGoBack = true;
  routerReplacements.length = 0;
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

function assertBackButton(leading: { type: unknown; props: Record<string, unknown> }) {
  assert.equal(leading.props.accessibilityLabel, '뒤로 가기');
  assert.equal(leading.props.targetSize, 44);
  assert.equal(leading.props.visualSize, 44);
  assert.equal(typeof leading.props.onPress, 'function');
  assert.equal((leading.props.children as { type: unknown }).type, 'ChevronLeftIcon');
}

describe('hashtag related profiles route identity and lifecycle', () => {
  it('모든 상태에 뒤로가기 action을 전달하고 history가 없으면 홈으로 이동한다', async () => {
    await renderScreen();

    const successLeading = requireRendered('HashtagRelatedProfileList').props.leading;
    assertBackButton(successLeading);
    successLeading.props.onPress();
    assert.equal(routerBackCount, 1);

    queryMode = 'loading';
    await renderScreen();
    const loadingLeading = requireRendered('HashtagRelatedProfileListState').props.leading;
    assertBackButton(loadingLeading);

    queryMode = 'error';
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await renderScreen();
      const errorLeading = requireRendered('HashtagRelatedProfileListState').props.leading;
      assertBackButton(errorLeading);
    } finally {
      console.error = originalConsoleError;
    }

    queryMode = 'success';
    hashtagNode = null;
    await renderScreen();
    const notFoundLeading = requireRendered('HashtagRelatedProfileListState').props.leading;
    assertBackButton(notFoundLeading);

    routerCanGoBack = false;
    notFoundLeading.props.onPress();
    assert.deepEqual(routerReplacements, ['/home']);
  });

  it('path의 exact Hashtag ID만 Node query와 목록에 전달한다', async () => {
    await renderScreen();

    assert.deepEqual(queryHistory.at(-1), {
      fetchKey: 0,
      variables: { id: 'hashtag-global-a' },
    });
    const list = requireRendered('HashtagRelatedProfileList');
    assert.equal(list.props.identity, 'hashtag-global-a');
    assert.equal(list.props.name, 'Fediverse');
    assertBackButton(list.props.leading);
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
    const state = requireRendered('HashtagRelatedProfileListState');
    assert.equal(state.props.state, 'notFound');
    assertBackButton(state.props.leading);
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
