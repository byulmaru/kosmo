import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { useNavigationCache } from 'expo-router/build/react-navigation/core/useNavigationCache';
import { createElement, Suspense, useCallback, useMemo, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PageHeader as PageHeaderComponent } from './PageHeader.native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HeaderOptions = { header?: (() => ReactNode) | undefined; headerShown?: boolean };

const setOptions = mock.fn<(options: HeaderOptions) => void>();
let renderer: ReactTestRenderer | null = null;
let activeNavigation: { setOptions: (options: HeaderOptions) => void } | null = null;
let routeOptionUpdates = 0;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useNavigation: () => activeNavigation ?? { setOptions },
});
mockModule('react-native', { View: 'View' });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 54 }),
});
mockModule(new URL('../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ backgroundCanvas: '#fff' }),
});
mockModule(new URL('./PageHeaderView.tsx', import.meta.url), {
  PageHeaderView: (props: { children?: ReactNode }) => createElement('PageHeaderView', props),
});
mockModule(new URL('./shell/NavigationDrawerTrigger.tsx', import.meta.url), {
  NavigationDrawerTrigger: () => createElement('NavigationDrawerTrigger'),
});

let PageHeader: typeof PageHeaderComponent;

const navigationState = { routes: [{ key: 'settings' }], index: 0 };

function NavigationHarness({ children }: { children: ReactNode }) {
  const [options, setOptionsState] = useState<Record<string, HeaderOptions>>({});
  const getState = useCallback(() => navigationState, []);
  const navigation = useMemo(
    () => ({
      getState,
      getId: () => 'settings-stack',
      getParent: () => undefined,
      isFocused: () => true,
      dispatch: () => undefined,
    }),
    [getState],
  );
  const router = useMemo(() => ({ actionCreators: {} }), []);
  const emitter = useMemo(() => ({ create: () => ({}) }), []);
  const setNavigationOptions = useCallback(
    (update: (previous: Record<string, HeaderOptions>) => Record<string, HeaderOptions>) => {
      routeOptionUpdates += 1;
      setOptionsState(update);
    },
    [],
  );
  const { navigations } = useNavigationCache({
    state: navigationState as never,
    getState: getState as never,
    navigation: navigation as never,
    setOptions: setNavigationOptions as never,
    router: router as never,
    emitter: emitter as never,
  });

  activeNavigation = navigations.settings as typeof activeNavigation;
  return createElement('NavigationHarness', { options: options.settings }, children);
}

before(async () => {
  ({ PageHeader } = await import('./PageHeader.native'));
});

test('Native PageHeader는 현재 Stack의 shell header로 렌더링된다', async () => {
  await act(async () => {
    renderer = create(createElement(PageHeader, { title: '알림' }));
  });

  const options = setOptions.mock.calls.at(-1)?.arguments[0];
  assert.equal(options?.headerShown, true);
  const header = options?.header?.();
  assert.ok(header && typeof header === 'object' && 'props' in header);
  const headerProps = header.props as {
    leading: { type: { name?: string } };
    title: string;
  };
  assert.equal(typeof header.type, 'function');
  assert.equal(typeof header.type === 'function' ? header.type.name : null, 'NativePageHeader');
  assert.equal(headerProps.title, '알림');
  assert.equal(headerProps.leading.type.name, 'NavigationDrawerTrigger');

  let nativeHeader: ReactTestRenderer | null = null;
  await act(async () => {
    nativeHeader = create(header);
  });
  const nativeHeaderRenderer = nativeHeader as ReactTestRenderer | null;
  assert.ok(nativeHeaderRenderer);
  assert.deepEqual(nativeHeaderRenderer.root.findByType('View' as never).props.style, {
    backgroundColor: '#fff',
    paddingTop: 54,
  });
  await act(async () => nativeHeader?.unmount());

  await act(async () => renderer?.unmount());
});

test('Native PageHeader는 route를 떠날 때 shell header를 해제한다', async () => {
  await act(async () => {
    renderer = create(createElement(PageHeader, { title: '설정' }));
  });

  await act(async () => renderer?.unmount());

  assert.deepEqual(setOptions.mock.calls.at(-1)?.arguments[0], {
    header: undefined,
    headerShown: false,
  });
});

test('Native custom PageHeader는 검색창을 그대로 shell header에 전달한다', async () => {
  const search = createElement('SearchInput');
  await act(async () => {
    renderer = create(createElement(PageHeader, null, search));
  });

  const header = setOptions.mock.calls.at(-1)?.arguments[0].header?.();
  assert.ok(header && typeof header === 'object' && 'props' in header);
  const headerProps = header.props as { children: ReactNode };
  assert.equal(headerProps.children, search);
  assert.equal('leading' in headerProps, false);

  await act(async () => renderer?.unmount());
});

test('Native PageHeader는 route가 지정한 leading action을 유지한다', async () => {
  const back = createElement('BackButton');
  await act(async () => {
    renderer = create(createElement(PageHeader, { leading: back, title: '프로필' }));
  });

  const header = setOptions.mock.calls.at(-1)?.arguments[0].header?.();
  assert.ok(header && typeof header === 'object' && 'props' in header);
  const headerProps = header.props as { leading: ReactNode };
  assert.equal(headerProps.leading, back);

  await act(async () => renderer?.unmount());
});

test('Native PageHeader는 props 갱신에 옵션을 한 번 반영하고 조건부 해제 때 header를 비운다', async () => {
  routeOptionUpdates = 0;

  await act(async () => {
    renderer = create(
      createElement(NavigationHarness, null, createElement(PageHeader, { title: '설정' })),
    );
  });

  assert.equal(routeOptionUpdates, 1);
  const initialOptions = renderer?.root.findByType('NavigationHarness' as never).props.options as
    | HeaderOptions
    | undefined;
  assert.equal(initialOptions?.headerShown, true);

  await act(async () => {
    renderer?.update(
      createElement(NavigationHarness, null, createElement(PageHeader, { title: '뮤트 및 차단' })),
    );
  });

  assert.equal(routeOptionUpdates, 2);
  const updatedOptions = renderer?.root.findByType('NavigationHarness' as never).props.options as
    | HeaderOptions
    | undefined;
  const updatedHeader = updatedOptions?.header?.();
  assert.ok(updatedHeader && typeof updatedHeader === 'object' && 'props' in updatedHeader);
  assert.equal((updatedHeader.props as { title: string }).title, '뮤트 및 차단');

  await act(async () => {
    renderer?.update(createElement(NavigationHarness, null, null));
  });

  assert.equal(routeOptionUpdates, 3);
  const clearedOptions = renderer?.root.findByType('NavigationHarness' as never).props.options as
    | HeaderOptions
    | undefined;
  assert.deepEqual(clearedOptions, { header: undefined, headerShown: false });

  await act(async () => renderer?.unmount());
  activeNavigation = null;
});

test('Native PageHeader는 Suspense fallback에서 resolved header로 전환된 뒤 표시 상태를 유지한다', async () => {
  let resolved = false;
  let resolveSuspension!: () => void;
  const suspension = new Promise<void>((resolve) => {
    resolveSuspension = resolve;
  });
  function ResolvedPageHeader() {
    if (!resolved) {
      throw suspension;
    }
    return createElement(PageHeader, { title: '불러온 프로필' });
  }

  await act(async () => {
    renderer = create(
      createElement(
        NavigationHarness,
        null,
        createElement(
          Suspense,
          { fallback: createElement(PageHeader, { title: '불러오는 중' }) },
          createElement(ResolvedPageHeader),
        ),
      ),
    );
  });

  const fallbackOptions = renderer?.root.findByType('NavigationHarness' as never).props.options as
    | HeaderOptions
    | undefined;
  assert.equal(fallbackOptions?.headerShown, true);
  const fallbackHeader = fallbackOptions?.header?.();
  assert.ok(fallbackHeader && typeof fallbackHeader === 'object' && 'props' in fallbackHeader);
  assert.equal((fallbackHeader.props as { title: string }).title, '불러오는 중');

  resolved = true;
  await act(async () => {
    resolveSuspension();
    await suspension;
  });

  const resolvedOptions = renderer?.root.findByType('NavigationHarness' as never).props.options as
    | HeaderOptions
    | undefined;
  assert.equal(resolvedOptions?.headerShown, true);
  const resolvedHeader = resolvedOptions?.header?.();
  assert.ok(resolvedHeader && typeof resolvedHeader === 'object' && 'props' in resolvedHeader);
  assert.equal((resolvedHeader.props as { title: string }).title, '불러온 프로필');

  await act(async () => renderer?.unmount());
  activeNavigation = null;
});
