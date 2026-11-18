import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, Fragment, Suspense } from 'react';
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
  PageHeaderView: ({
    children,
    leading,
    title,
  }: {
    children?: ReactNode;
    leading?: ReactNode;
    title?: string;
  }) =>
    createElement(
      'PageHeaderView',
      null,
      children ?? [
        leading,
        title ? createElement('Text', { accessibilityRole: 'header' }, title) : null,
      ],
    ),
});
mockModule(new URL('./shell/NavigationDrawerTrigger.tsx', import.meta.url), {
  NavigationDrawerTrigger: () =>
    createElement('Pressable', {
      accessibilityLabel: '메뉴 열기',
      accessibilityRole: 'button',
    }),
});

let PageHeader: typeof PageHeaderComponent;

const options = () => setOptions.mock.calls.at(-1)?.arguments[0];

async function renderShellHeader(): Promise<ReactTestRenderer> {
  const renderHeader = options()?.header;
  assert.ok(renderHeader);
  let shellHeader!: ReactTestRenderer;
  await act(async () => {
    shellHeader = create(createElement(Fragment, null, renderHeader()));
  });
  return shellHeader;
}

function headerTitle(shellHeader: ReactTestRenderer): string | undefined {
  const heading = shellHeader.root.findAll((node) => node.props.accessibilityRole === 'header')[0];
  return heading?.children.join('');
}

function hasAccessibleElement(
  shellHeader: ReactTestRenderer,
  accessibilityRole: string,
  accessibilityLabel: string,
): boolean {
  return (
    shellHeader.root.findAll(
      (node) =>
        node.props.accessibilityRole === accessibilityRole &&
        node.props.accessibilityLabel === accessibilityLabel,
    ).length > 0
  );
}

async function unmountShellHeader(shellHeader: ReactTestRenderer) {
  await act(async () => shellHeader.unmount());
}

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
  const shellHeader = await renderShellHeader();

  assert.equal(headerTitle(shellHeader), '알림');
  assert.equal(hasAccessibleElement(shellHeader, 'button', '메뉴 열기'), true);
  const headerStyle = shellHeader.root.findByType('View' as never).props.style as Record<
    string,
    unknown
  >;
  assert.equal(headerStyle.backgroundColor, '#fff');
  assert.equal(headerStyle.paddingTop, 54);
  await unmountShellHeader(shellHeader);
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
  await act(async () => {
    renderer = create(
      createElement(
        PageHeader,
        null,
        createElement('TextInput', {
          accessibilityLabel: '프로필 검색',
          accessibilityRole: 'search',
        }),
      ),
    );
  });

  const shellHeader = await renderShellHeader();
  assert.equal(hasAccessibleElement(shellHeader, 'search', '프로필 검색'), true);
  assert.equal(hasAccessibleElement(shellHeader, 'button', '메뉴 열기'), false);
  await unmountShellHeader(shellHeader);
});

test('Native PageHeader는 route가 지정한 leading action을 유지한다', async () => {
  await act(async () => {
    renderer = create(
      createElement(PageHeader, {
        leading: createElement('Pressable', {
          accessibilityLabel: '뒤로 가기',
          accessibilityRole: 'button',
        }),
        title: '프로필',
      }),
    );
  });

  const shellHeader = await renderShellHeader();
  assert.equal(headerTitle(shellHeader), '프로필');
  assert.equal(hasAccessibleElement(shellHeader, 'button', '뒤로 가기'), true);
  await unmountShellHeader(shellHeader);
});

test('Native PageHeader는 제목을 갱신하고 조건부 해제 때 header를 비운다', async () => {
  await act(async () => {
    renderer = create(createElement('Page', null, createElement(PageHeader, { title: '설정' })));
  });

  assert.equal(options()?.headerShown, true);
  let shellHeader = await renderShellHeader();
  assert.equal(headerTitle(shellHeader), '설정');
  await unmountShellHeader(shellHeader);

  await act(async () => {
    renderer?.update(
      createElement('Page', null, createElement(PageHeader, { title: '뮤트 및 차단' })),
    );
  });

  assert.equal(options()?.headerShown, true);
  shellHeader = await renderShellHeader();
  assert.equal(headerTitle(shellHeader), '뮤트 및 차단');
  await unmountShellHeader(shellHeader);

  await act(async () => {
    renderer?.update(createElement('Page'));
  });

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
  let shellHeader = await renderShellHeader();
  assert.equal(headerTitle(shellHeader), '불러오는 중');
  await unmountShellHeader(shellHeader);

  resolved = true;
  await act(async () => {
    resolveSuspension();
    await suspension;
  });

  assert.equal(options()?.headerShown, true);
  shellHeader = await renderShellHeader();
  assert.equal(headerTitle(shellHeader), '불러온 프로필');
  await unmountShellHeader(shellHeader);
});
