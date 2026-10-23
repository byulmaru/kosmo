import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const platform = { OS: 'ios' };

mockModule('expo-router', {
  Redirect: () => null,
  useLocalSearchParams: () => ({ timeline: 'local' }),
  useRouter: () => ({ replace: () => undefined, setParams: () => undefined }),
});
mockModule('lucide-react-native', { UserRoundPlus: 'UserRoundPlus' });
mockModule(require.resolve('lucide-react-native'), { UserRoundPlus: 'UserRoundPlus' });
mockModule('react-native', {
  Platform: platform,
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ height: 844, width: timelineViewportWidth }),
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
mockModule('@/components/coachmark/TimelineCoachmark', {
  TimelineCoachmark: MockTimelineCoachmark,
  TimelineHelpButton: () => null,
});
function MockPageHeader(props: object) {
  return createElement('PageHeader', props);
}

mockModule('@/components/PageHeader', {
  PageHeader: MockPageHeader,
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
  getShellLayout: (_web: boolean, width: number) =>
    width < 768 ? 'mobile' : width < 1280 ? 'compact' : 'full',
  getTimelineGuideViewportWidth: (web: boolean, width: number) =>
    web ? timelineInnerWidth : width,
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/TimelineTabs', { TimelineTabs: () => null });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/session/SessionProvider', { useSession: () => ({ status: 'valid' }) });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
});

let HomeScreen: ComponentType;
let timelineViewportWidth = 390;
let timelineInnerWidth = 390;

function MockTimelineCoachmark(props: Record<string, unknown>) {
  return createElement('TimelineCoachmarkProbe', props);
}

before(async () => {
  ({ default: HomeScreen } = await import('../../app/(tabs)/(protected)/home'));
});

test('Native 타임라인 파라미터가 Local이면 같은 route에서 Local 콘텐츠를 표시한다', async () => {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(createElement(HomeScreen));
  });

  const header = renderer!.root.findByType(MockPageHeader);
  assert.equal(header.props.accessibilityLabel, '로컬');
});

test('Web scrollbar lock 폭 변화는 mobile과 desktop lifecycle을 재시작하지 않는다', async () => {
  platform.OS = 'web';

  let renderer: ReactTestRenderer | null = null;

  timelineViewportWidth = 753;
  timelineInnerWidth = 768;
  await act(async () => {
    renderer = create(createElement(HomeScreen));
  });
  const mobileBeforeLockKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;

  timelineViewportWidth = 768;
  await act(async () => {
    renderer?.update(createElement(HomeScreen));
  });
  const mobileAfterLockKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;
  assert.equal(mobileBeforeLockKey, mobileAfterLockKey);

  timelineViewportWidth = 767;
  timelineInnerWidth = 767;
  await act(async () => {
    renderer?.update(createElement(HomeScreen));
  });
  const mobileAfterResizeKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;
  assert.notEqual(mobileAfterResizeKey, mobileAfterLockKey);

  timelineViewportWidth = 1_265;
  timelineInnerWidth = 1_280;
  await act(async () => {
    renderer?.update(createElement(HomeScreen));
  });
  const desktopBeforeLockKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;

  timelineViewportWidth = 1_280;
  await act(async () => {
    renderer?.update(createElement(HomeScreen));
  });
  const desktopAfterLockKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;

  assert.equal(desktopBeforeLockKey, desktopAfterLockKey);

  timelineViewportWidth = 1_279;
  timelineInnerWidth = 1_279;
  await act(async () => {
    renderer?.update(createElement(HomeScreen));
  });
  const desktopAfterResizeKey = renderer!.root.findByType(MockTimelineCoachmark).props.lifecycleKey;
  assert.notEqual(desktopAfterResizeKey, desktopAfterLockKey);

  await act(async () => renderer?.unmount());
});
