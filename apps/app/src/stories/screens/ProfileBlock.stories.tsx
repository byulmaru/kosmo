import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PageHeader } from '@/components/PageHeader';
import { getShellLayout } from '@/components/shell/shellLayout';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
import { SessionProvider } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import ogDefaultUrl from '../../../public/og-default.png?url';
import { profile, shellQuery } from '../fixtures';
import heroMeta, { ProfileHeroFixture } from '../patterns/ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import type { ProfileBlockFeedback } from '@/components/profile/ProfileBlockAction';
import type { ProfileBlockShellQuery as ProfileBlockShellQueryType } from './__generated__/ProfileBlockShellQuery.graphql';

const selectedProfile = profile({
  avatar: { id: 'profile-block-screen-selected-avatar', url: appleTouchIconUrl },
  displayName: '차단 화면 계정',
  header: { id: 'profile-block-screen-selected-header', url: ogDefaultUrl },
  handle: 'block-screen',
  id: 'profile-block-screen-selected',
  relativeHandle: '@block-screen',
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: true,
    membership: { role: 'OWNER' },
  },
});
const shellFixture = shellQuery({ profiles: [selectedProfile], selectedProfile });
const shellData = {
  ...shellFixture,
  currentSession: {
    ...shellFixture.currentSession,
    selectedProfile: {
      ...selectedProfile,
      viewerState: {
        ...selectedProfile.viewerState,
        membership: { id: 'profile-block-screen-membership', role: 'OWNER' },
      },
    },
  },
};
const heroRelayData = heroMeta.parameters.relay.data;
const profileIds = [
  'profile-hero-default',
  'profile-hero-images',
  'profile-hero-tags',
  'profile-hero-long-tags',
  'profile-hero-no-bio',
] as const;
const relayData = {
  ...heroRelayData,
  ...shellData,
  currentSession: { ...heroRelayData.currentSession, ...shellData.currentSession },
};

const ProfileBlockShellQuery = graphql`
  query ProfileBlockShellQuery {
    ...SidebarNavigation_query
    currentSession {
      id
      selectedProfile {
        id
      }
    }
  }
`;

type ScreenState = 'blocking' | 'profile';
type Outcome = 'success' | 'error' | 'pending';

type FixtureProps = {
  initialState: ScreenState;
  onBlock: () => Promise<void>;
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  onFeedback: (feedback: ProfileBlockFeedback) => void;
  onBack: () => void;
  onDismiss: () => void;
  onTabChange: (tab: string) => void;
  onUnblock: () => Promise<void>;
  outcome: Outcome;
  profileId: string;
};

const tabs = [
  { label: '게시물', value: 'posts' },
  { label: '답글', value: 'replies' },
  { label: '미디어', value: 'media' },
  { label: '별', value: 'stars' },
] as const;

function ProfileBlockScreenFixture({
  initialState,
  onBack,
  onDismiss,
  onBlock,
  onMute,
  onUnmute,
  onFeedback,
  onTabChange,
  onUnblock,
  outcome,
  profileId,
}: FixtureProps) {
  const theme = useTheme();
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState('posts');
  const screenContentRef = useRef<View>(null);
  const previousState = useRef(initialState);
  const target = heroRelayData.nodes.find((node) => node.id === profileId)!;

  useEffect(() => {
    setState(initialState);
    setTab('posts');
  }, [initialState, profileId, outcome]);

  useEffect(() => {
    if (previousState.current !== state) {
      screenContentRef.current?.focus();
    }
    previousState.current = state;
  }, [state]);

  const handleFeedback = (feedback: ProfileBlockFeedback) => {
    onFeedback(feedback);
    if (feedback.status === 'success') {
      setState(feedback.blocked ? 'blocking' : 'profile');
    }
  };

  return (
    <View style={styles.screenContent} testID="profile-block-screen">
      <PageHeader
        leading={
          <IconButton accessibilityLabel="뒤로" onPress={onBack} targetSize={44} visualSize={44}>
            <ArrowLeft color={theme.foregroundPrimary} size={24} />
          </IconButton>
        }
        title={target.displayName}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View
          ref={screenContentRef}
          {...focusProps}
          style={styles.profileContent}
          testID="profile-block-screen-content"
        >
          <ProfileHeroFixture
            initialBlocked={initialState === 'blocking'}
            onBlock={onBlock}
            onMute={onMute}
            onUnmute={onUnmute}
            onBlockFeedback={handleFeedback}
            onBlockDismiss={onDismiss}
            onUnblock={onUnblock}
            outcome={outcome}
            profileId={profileId}
          />
          <TabList
            accessibilityLabel="프로필 게시물"
            onValueChange={(value) => {
              setTab(value);
              onTabChange(value);
            }}
            value={tab}
            variant="underline"
          >
            {tabs.map((option) => (
              <Tab key={option.value} option={option} />
            ))}
          </TabList>
          <View style={styles.posts} testID="profile-block-posts">
            <StateView
              title={state === 'blocking' ? '차단됨' : '게시물이 없습니다'}
              description={
                state === 'blocking' ? '이 사용자의 게시물·프로필을 보지 않아요.' : undefined
              }
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileBlockShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const data = useLazyLoadQuery<ProfileBlockShellQueryType>(ProfileBlockShellQuery, {});
  const layout = getShellLayout(Platform.OS === 'web', width);

  if (layout === 'mobile') {
    return (
      <View style={[styles.root, { height }]} testID="profile-block-shell">
        {children}
      </View>
    );
  }

  const sidebarWidth = layout === 'full' ? 320 : 80;
  return (
    <View style={[styles.root, styles.desktopRoot, { height }]} testID="profile-block-shell">
      <View
        style={[styles.sidebar, { borderColor: theme.borderSubtle, width: sidebarWidth }]}
        testID="profile-block-sidebar"
      >
        <SidebarNavigation compact={layout === 'compact'} query={data} />
      </View>
      <View style={styles.desktopContent} testID="profile-block-content">
        <View style={styles.desktopInner} testID="profile-block-inner">
          {children}
        </View>
      </View>
    </View>
  );
}

function ScreenStory(args: FixtureProps) {
  return (
    <SessionProvider>
      <ProfileBlockShell>
        <ProfileBlockScreenFixture key={args.profileId} {...args} />
      </ProfileBlockShell>
    </SessionProvider>
  );
}

const focusProps = Platform.OS === 'web' ? { tabIndex: -1 as const } : { focusable: true };

const meta = {
  excludeStories: ['ProfileBlockScreenFixture', 'ProfileBlockShell', 'ScreenStory'],
  args: {
    initialState: 'blocking',
    onBlock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onMute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUnmute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onFeedback: fn(),
    onBack: fn(),
    onDismiss: fn(),
    onTabChange: fn(),
    onUnblock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
    profileId: 'profile-hero-default',
  },
  argTypes: {
    initialState: { control: 'inline-radio', options: ['blocking', 'profile'] },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    profileId: { control: 'select', options: profileIds },
  },
  component: ScreenStory,
  parameters: {
    layout: 'fullscreen',
    relay: { data: relayData },
    router: { pathname: '/@profile-hero' },
  },
  title: 'KOSMO/Screens/Profile Block',
} satisfies Meta<typeof ScreenStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Full: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
};
export const Compact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};
export const Mobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

const styles = StyleSheet.create({
  root: { alignSelf: 'center', flexDirection: 'row', minHeight: 0, width: '100%' },
  desktopRoot: { maxWidth: 1270 },
  sidebar: { borderRightWidth: 1, minHeight: 0 },
  desktopContent: { alignItems: 'center', flex: 1, minWidth: 0 },
  desktopInner: { flex: 1, maxWidth: '100%', width: 600 },
  screenContent: { flex: 1, minHeight: 0, width: '100%' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  profileContent: { flex: 1, width: '100%' },
  posts: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 240,
    paddingTop: space[48],
  },
});
