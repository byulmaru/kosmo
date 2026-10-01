import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, Suspense } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PageHeader as PageHeaderComponent } from './PageHeader.native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HeaderOptions = { header?: () => ReactNode; headerShown?: boolean };

const setOptions = mock.fn<(options: HeaderOptions) => void>();
const navigation = { setOptions };
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useNavigation: () => navigation,
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

const options = () => setOptions.mock.calls.at(-1)?.arguments[0];

before(async () => {
  ({ PageHeader } = await import('./PageHeader.native'));
});

beforeEach(() => setOptions.mock.resetCalls());

afterEach(async () => {
  const mounted = renderer;
  renderer = null;
  if (mounted) {
    await act(async () => mounted.unmount());
  }
});

test('Native PageHeader는 현재 Stack의 shell header로 렌더링된다', async () => {
  await act(async () => {
    renderer = create(createElement(PageHeader, { title: '알림' }));
  });

  assert.equal(options()?.headerShown, true);
  const header = options()?.header?.();
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
});

test('Native PageHeader는 route를 떠날 때 shell header를 해제한다', async () => {
  await act(async () => {
    renderer = create(createElement(PageHeader, { title: '설정' }));
  });

  const mounted = renderer;
  renderer = null;
  await act(async () => mounted?.unmount());

  assert.deepEqual(options(), {
    header: undefined,
    headerShown: false,
  });
});

test('Native custom PageHeader는 검색창을 그대로 shell header에 전달한다', async () => {
  const search = createElement('SearchInput');
  await act(async () => {
    renderer = create(createElement(PageHeader, null, search));
  });

  const header = options()?.header?.();
  assert.ok(header && typeof header === 'object' && 'props' in header);
  const headerProps = header.props as { children: ReactNode };
  assert.equal(headerProps.children, search);
  assert.equal('leading' in headerProps, false);
});

test('Native PageHeader는 route가 지정한 leading action을 유지한다', async () => {
  const back = createElement('BackButton');
  await act(async () => {
    renderer = create(createElement(PageHeader, { leading: back, title: '프로필' }));
  });

  const header = options()?.header?.();
  assert.ok(header && typeof header === 'object' && 'props' in header);
  const headerProps = header.props as { leading: ReactNode };
  assert.equal(headerProps.leading, back);
});

test('Native PageHeader는 props 갱신에 옵션을 한 번 반영하고 조건부 해제 때 header를 비운다', async () => {
  await act(async () => {
    renderer = create(createElement('Page', null, createElement(PageHeader, { title: '설정' })));
  });

  assert.equal(setOptions.mock.calls.length, 1);
  assert.equal(options()?.headerShown, true);

  await act(async () => {
    renderer?.update(
      createElement('Page', null, createElement(PageHeader, { title: '뮤트 및 차단' })),
    );
  });

  assert.equal(setOptions.mock.calls.length, 2);
  const updatedHeader = options()?.header?.();
  assert.ok(updatedHeader && typeof updatedHeader === 'object' && 'props' in updatedHeader);
  assert.equal((updatedHeader.props as { title: string }).title, '뮤트 및 차단');

  await act(async () => {
    renderer?.update(createElement('Page'));
  });

  assert.equal(setOptions.mock.calls.length, 3);
  assert.deepEqual(options(), { header: undefined, headerShown: false });
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
        'Page',
        null,
        createElement(
          Suspense,
          { fallback: createElement(PageHeader, { title: '불러오는 중' }) },
          createElement(ResolvedPageHeader),
        ),
      ),
    );
  });

  assert.equal(options()?.headerShown, true);
  const fallbackHeader = options()?.header?.();
  assert.ok(fallbackHeader && typeof fallbackHeader === 'object' && 'props' in fallbackHeader);
  assert.equal((fallbackHeader.props as { title: string }).title, '불러오는 중');

  resolved = true;
  await act(async () => {
    resolveSuspension();
    await suspension;
  });

  assert.equal(options()?.headerShown, true);
  const resolvedHeader = options()?.header?.();
  assert.ok(resolvedHeader && typeof resolvedHeader === 'object' && 'props' in resolvedHeader);
  assert.equal((resolvedHeader.props as { title: string }).title, '불러온 프로필');
});
