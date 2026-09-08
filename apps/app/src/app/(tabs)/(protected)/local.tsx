import { UserRoundPlus } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import {
  getShellLayout,
  getWebMobileShellHeaderStickyOffset,
} from '@/components/shell/shellLayout';
import { TimelineTabs } from '@/components/TimelineTabs';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { ViewStyle } from 'react-native';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
import type { LocalPageQuery } from './__generated__/LocalPageQuery.graphql';

const LocalQuery = graphql`
  query LocalPageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    me {
      id
      profiles {
        id
      }
    }
    ...PostList_local @arguments(count: 20)
  }
`;

export default function LocalScreen() {
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const refresh = useCallback(() => routeBoundaryRef.current?.refetch(), []);

  return (
    <LocalFrame onReselect={refresh}>
      <RouteBoundary
        loading={<StateView loading title="로컬 타임라인을 불러오는 중입니다." />}
        ref={routeBoundaryRef}
        title="로컬 타임라인을 불러오지 못했어요"
      >
        <LocalContent />
      </RouteBoundary>
    </LocalFrame>
  );
}

function LocalFrame({ children, onReselect }: PropsWithChildren<{ onReselect: () => void }>) {
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <View style={styles.root}>
      {routeOwnsHeader ? <PageHeader accessibilityLabel="로컬" variant="brand" /> : null}
      <View
        style={
          Platform.OS === 'web'
            ? [styles.webTimelineTabs, { top: getWebMobileShellHeaderStickyOffset(width) }]
            : undefined
        }
      >
        <TimelineTabs onReselect={onReselect} value="local" />
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function LocalContent() {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  const { fetchKey } = useRouteBoundary();
  const profileMuteTimelineRevision = shellChrome?.profileMuteTimelineRevision ?? 0;
  const data = useLazyLoadQuery<LocalPageQuery>(
    LocalQuery,
    {},
    { fetchKey: `${profileMuteTimelineRevision}:${fetchKey}`, fetchPolicy: 'store-and-network' },
  );
  const selectedProfile = data.currentSession?.selectedProfile ?? null;
  const hasProfiles = (data.me?.profiles?.length ?? 0) > 0;

  if (!selectedProfile) {
    return (
      <View style={styles.onboardingRoot}>
        <View style={styles.onboarding}>
          <UserRoundPlus color={theme.textSecondary} size={48} strokeWidth={1.5} />
          <Text accessibilityRole="header" style={[styles.onboardingTitle, { color: theme.text }]}>
            {hasProfiles ? '사용할 프로필을 선택해주세요' : '프로필을 만들어 시작하세요'}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {hasProfiles
              ? '로컬 타임라인을 보려면 사용할 프로필을 먼저 선택해야 해요.'
              : '프로필을 만들면 로컬 게시물을 둘러볼 수 있어요.'}
          </Text>
          <Button onPress={() => shellChrome?.openProfileSwitcher()} style={styles.action}>
            {hasProfiles ? '프로필 선택' : '프로필 만들기'}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      <PostList
        identityKey={`local:${selectedProfile.id}`}
        local={data}
        replyProfile={selectedProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  timeline: { flex: 1, minHeight: 0, width: '100%' },
  webTimelineTabs: { position: 'sticky' as never, zIndex: 10 } as ViewStyle,
  onboardingRoot: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  onboarding: { alignItems: 'center', maxWidth: 448, width: '100%' },
  onboardingTitle: {
    fontFamily: fontFamilies.ui,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
    ...typography.md,
  },
  description: {
    fontFamily: fontFamilies.ui,
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
  action: { marginTop: spacing.xl },
});
