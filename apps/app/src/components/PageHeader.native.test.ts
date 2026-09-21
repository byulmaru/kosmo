import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PageHeader as PageHeaderComponent } from './PageHeader.native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HeaderOptions = { header?: (() => ReactNode) | undefined; headerShown?: boolean };

const setOptions = mock.fn<(options: HeaderOptions) => void>();
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useNavigation: () => ({ setOptions }),
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
