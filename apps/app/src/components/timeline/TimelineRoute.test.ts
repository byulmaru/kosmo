import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ timeline: 'local' }),
  useRouter: () => ({ replace: () => undefined, setParams: () => undefined }),
});
mockModule('lucide-react-native', { UserRoundPlus: 'UserRoundPlus' });
mockModule(require.resolve('lucide-react-native'), { UserRoundPlus: 'UserRoundPlus' });
mockModule('react-native', {
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: 'View',
});
mockModule('react-error-boundary', {
  useErrorBoundary: () => ({ showBoundary: () => undefined }),
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, data: unknown) => data,
  useLazyLoadQuery: () => ({
    currentSession: { id: 'session', selectedProfile: { id: 'profile' } },
    me: { id: 'me', profiles: [{ id: 'profile' }] },
  }),
  useRefetchableFragment: () => [null, () => undefined],
  useRelayEnvironment: () => ({
    check: () => ({ status: 'missing' }),
    retain: () => ({ dispose: () => undefined }),
  }),
});
mockModule('relay-runtime', {
  createOperationDescriptor: () => ({}),
  fetchQuery: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
  getRequest: () => ({}),
});
mockModule('@/components/PageHeader', {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule('@/components/post/PostList', { PostList: () => null });
mockModule('@/components/RelayFailOpenBoundary', {
  RelayFailOpenBoundary: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/shellLayout', {
  getShellLayout: () => 'mobile',
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/TimelineTabs', { TimelineTabs: () => null });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
});

let HomeScreen: ComponentType;

before(async () => {
  ({ default: HomeScreen } = await import('../../app/(tabs)/(protected)/home'));
});

test('Native 타임라인 파라미터가 Local이면 같은 route에서 Local 콘텐츠를 표시한다', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(HomeScreen));
  });

  const header = renderer!.root.findByType('PageHeader');
  assert.equal(header.props.accessibilityLabel, '로컬');
});
