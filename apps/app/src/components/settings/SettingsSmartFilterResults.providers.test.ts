import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, it, mock } from 'node:test';
import { createContext, createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SettingsSmartFilterResults as SettingsSmartFilterResultsExport } from './SettingsSmartFilterResults';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const profile = { id: 'profile:member' };
const navigations: string[] = [];
const post = {
  actionSurface: { id: 'post-one' },
  content: {
    bodyText: '확인할 게시글',
    contentWarning: null,
    document: null,
    id: 'content:one',
    media: [],
    mentionedProfiles: [],
  },
  createdAt: '2026-11-09T00:00:00Z',
  id: 'post-one',
  slug: 'SmFilter0001',
  profile: {
    avatar: null,
    displayName: '게시자',
    id: 'profile:author',
    relativeHandle: '@author',
  },
  replyCount: 0,
  replyParent: null,
  replySurface: { id: 'post-one' },
  repostSource: null,
  visibility: 'PUBLIC',
};
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const mockTokens = {
  breakpoints: { compact: 768, full: 1280 },
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { formStack: {} },
  radii: { full: 999, md: 12, sm: 8 },
  spacing: { lg: 16, md: 12, sm: 8, xs: 4, xxl: 32, xxxl: 48 },
  textStyles: { uiCopyM: {}, uiLabelS: {} },
  typography: { sm: { fontSize: 14 } },
};
const mockTheme = {
  backgroundCanvas: 'canvas',
  borderSubtle: 'border',
  foregroundSecondary: 'secondary',
  stateHover: 'hover',
  statePressedSubtle: 'pressed',
  textSecondary: 'secondary',
};

mockModule('react-relay', {
  ...ReactRelay,
  graphql: () => ({}),
  useFragment: () => post,
  useLazyLoadQuery: () => ({ currentSession: { selectedProfile: profile } }),
  usePaginationFragment: () => ({
    data: {
      smartFilterResults: {
        edges: [
          {
            node: {
              __id: 'post:one',
              id: post.id,
              smartFilterProbability: 0.93,
            },
          },
        ],
      },
    },
    hasNext: false,
    isLoadingNext: false,
    loadNext: () => undefined,
  }),
});
mockModule('expo-router', {
  Link: ({ children }: { children: ReactNode }) => children,
  unstable_navigationEvents: { addListener: () => () => undefined },
  useIsFocused: () => true,
  useRouter: () => ({ push: (href: string) => navigations.push(href) }),
});
mockModule('react-native', {
  Platform: { OS: 'ios' },
  Pressable: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Pressable', props, children),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390 }),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule(require.resolve('lucide-react-native'), {
  MessageCircle: 'MessageCircle',
  Pin: 'Pin',
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ openProfileSwitcher: () => undefined }),
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: () => createElement('ProfileNameBlock'),
});
mockModule('@/components/ui/Avatar', { Avatar: () => null });
mockModule('@/components/ui/TimestampText', {
  TimestampText: ({ children }: { children: ReactNode }) => createElement('Text', null, children),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: Record<string, unknown>) => createElement('StateView', props),
});
mockModule('@/components/ui/TextField', {
  TextArea: (props: Record<string, unknown>) => createElement('TextArea', props),
});
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금' });
mockModule('@/relay/RelayActorProvider', { useRelayActorLifecycleKey: () => 'actor' });
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: profile.id, sessionId: 'session:one', status: 'valid' }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    ...mockTheme,
    feedbackDangerBase: 'danger',
    feedbackDangerOnSubtle: 'danger',
  }),
});
mockModule('@/theme/tokens', mockTokens);
mockModule('@/components/shell/shellLayout', { getShellLayout: () => 'mobile' });
mockModule(new URL('../post/PostBody.tsx', import.meta.url), {
  PostBody: ({ onBodyPress, post: item }: { onBodyPress: () => void; post: typeof post }) =>
    createElement('Text', { onPress: onBodyPress }, item.content.bodyText),
});
mockModule(new URL('../post/PostActionSurface.tsx', import.meta.url), {
  PostActionSurface: () => createElement('PostActionSurface'),
});
mockModule(new URL('../post/PostSourcePresentationView.tsx', import.meta.url), {
  PostSourcePresentationView: () => null,
  PostSourcePreview: () => null,
});
mockModule(new URL('../post/PostVisibilityIcon.tsx', import.meta.url), {
  PostVisibilityIcon: () => null,
});
mockModule(new URL('../post/PostMediaViewer.tsx', import.meta.url), {
  PostMediaViewer: () => null,
  PostMediaViewerContent: () => null,
  PostMediaViewerQueryState: () => null,
});
mockModule(new URL('../post/PostMediaViewerThread.tsx', import.meta.url), {
  PostMediaViewerThread: () => null,
});
mockModule(new URL('../post/PostDetailBackground.tsx', import.meta.url), {
  PostDetailBackground: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => createElement('View', props, children),
  PostDetailBackgroundFeedbackContext: createContext<((pressed: boolean) => void) | undefined>(
    undefined,
  ),
});
mockModule(new URL('../post/ReplyComposerSurface.tsx', import.meta.url), {
  ReplyComposerSurface: 'ReplyComposerSurface',
});

let renderer: ReactTestRenderer | null = null;
let SettingsSmartFilterResults: typeof SettingsSmartFilterResultsExport;

before(async () => {
  ({ SettingsSmartFilterResults } = await import('./SettingsSmartFilterResults'));
});

it('renders and opens an actual PostListItem with the production providers', async () => {
  navigations.length = 0;
  await act(async () => {
    renderer = create(createElement(SettingsSmartFilterResults));
  });

  const reveal = renderer!.root.find(
    (node) => (node.type as unknown) === 'Button' && node.children.includes('판정 결과 보기'),
  );
  await act(async () => reveal.props.onPress());

  const body = renderer!.root.find((node) => node.children.includes('확인할 게시글'));
  assert.ok(body);
  await act(async () => (body.props.onPress as () => void)());
  assert.deepEqual(navigations, ['/@author/SmFilter0001']);

  await act(async () => renderer?.unmount());
  renderer = null;
});
