import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RouteState = 'pending' | 'error' | 'ready';
type Router = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: string) => void;
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);
const require = createRequire(import.meta.url);

mockModule('expo-crypto', { randomUUID });

let canGoBack = false;
let routeState: RouteState = 'ready';
let renderer: ReactTestRenderer | null = null;
let backCalls = 0;
const fetchKeys: string[] = [];
const replacements: string[] = [];
const pendingRoute = new Promise<never>(() => undefined);
const router: Router = {
  back: () => {
    backCalls += 1;
  },
  canGoBack: () => canGoBack,
  replace: (href) => replacements.push(href),
};

mockModule('expo-router', { useRouter: () => router });
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 24 }),
});
mockModule('lucide-react-native', { ArrowLeft: 'ArrowLeft' });
mockModule(require.resolve('lucide-react-native'), { ArrowLeft: 'ArrowLeft' });
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: ({ children }: { children: ReactNode }) =>
    createElement('PageHeader', null, children),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('IconButton', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ backgroundCanvas: '#fff', foregroundPrimary: '#111' }),
});
mockModule('@/theme/tokens', {
  iconSizes: { 24: 24 },
  textStyles: { uiHeadingM: {} },
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('./ProfileEditRoute.tsx', import.meta.url), {
  ProfileEditRoute: ({ fetchKey }: { fetchKey: string }) => {
    fetchKeys.push(fetchKey);
    if (routeState === 'pending') {
      throw pendingRoute;
    }
    if (routeState === 'error') {
      throw new Error('profile query failed');
    }
    return createElement('ProfileEditRoute', { fetchKey });
  },
});

let ProfileEditPage: ComponentType;

before(async () => {
  ({ default: ProfileEditPage } = await import('../../app/(tabs)/(protected)/profile-edit'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  canGoBack = false;
  backCalls = 0;
  routeState = 'ready';
  fetchKeys.length = 0;
  replacements.length = 0;
});

test('loading fallback keeps the shared header and falls back to Home on back', async () => {
  routeState = 'pending';
  await renderPage();

  assert.equal(findByProps({ title: '프로필 편집 정보를 불러오는 중입니다.' }).props.loading, true);
  findByProps({ testID: 'profile-edit-screen-header' });
  assert.equal(findByProps({ accessibilityLabel: '저장' }).props.disabled, true);

  await act(async () => findByProps({ accessibilityLabel: '프로필 편집 닫기' }).props.onPress());
  assert.deepEqual(replacements, ['/home']);

  canGoBack = true;
  await act(async () => findByProps({ accessibilityLabel: '프로필 편집 닫기' }).props.onPress());
  assert.equal(backCalls, 1);
  assert.deepEqual(replacements, ['/home']);
});

test('error fallback keeps retry behavior and refetches the route after retry', async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    routeState = 'error';
    await renderPage();

    const error = findByProps({ title: '프로필 편집 정보를 불러오지 못했어요' });
    findByProps({ testID: 'profile-edit-screen-header' });
    assert.equal(error.props.alert, true);
    assert.equal(findByProps({ accessibilityLabel: '저장' }).props.disabled, true);

    routeState = 'ready';
    await act(async () => error.props.onAction());

    const initialFetchKey = fetchKeys[0];
    const retriedFetchKey = fetchKeys.at(-1);
    assert.ok(initialFetchKey && retriedFetchKey);
    assert.equal(findByType('ProfileEditRoute').props.fetchKey, retriedFetchKey);
    assert.notEqual(retriedFetchKey, initialFetchKey);
  } finally {
    console.error = originalConsoleError;
  }
});

async function renderPage() {
  await act(async () => {
    renderer = create(createElement(ProfileEditPage));
  });
  assert.ok(renderer);
}

function findByProps(props: Record<string, unknown>): ReactTestInstance {
  assert.ok(renderer);
  const matches = renderer.root.findAllByProps(props);
  const node = matches.at(-1);
  assert.ok(node);
  return node;
}

function findByType(type: string): ReactTestInstance {
  assert.ok(renderer);
  const node = renderer.root.findAll((instance) => instance.type === type)[0];
  assert.ok(node);
  return node;
}
