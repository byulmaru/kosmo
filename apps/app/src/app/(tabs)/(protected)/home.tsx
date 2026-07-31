import { UserRoundPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { HomePageQuery } from './__generated__/HomePageQuery.graphql';

const HomeQuery = graphql`
  query HomePageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    me {
      id
      name
      profiles {
        id
      }
    }
    homeTimeline(first: 20) {
      ...PostList_homeTimeline
    }
  }
`;

export default function HomeScreen() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <HomeFrame>
      <RouteBoundary
        loading={<StateView loading title="홈을 불러오는 중입니다." />}
        onRetry={() => setFetchKey((key) => key + 1)}
        title="홈을 불러오지 못했어요"
      >
        <HomeContent fetchKey={`${revision}:${fetchKey}`} />
      </RouteBoundary>
    </HomeFrame>
  );
}

function HomeFrame({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <ScrollView contentContainerStyle={styles.root}>
      {routeOwnsHeader ? <PageHeader accessibilityLabel="홈" variant="brand" /> : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

function HomeContent({ fetchKey }: { fetchKey: string }) {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  const data = useLazyLoadQuery<HomePageQuery>(
    HomeQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
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
              ? '홈을 보려면 사용할 프로필을 먼저 선택해야 해요.'
              : '프로필을 만들면 글을 쓰고 피드를 볼 수 있어요.'}
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
      <PostList homeTimeline={data.homeTimeline} replyProfile={selectedProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
  },
  body: { flexGrow: 1 },
  timeline: { paddingHorizontal: spacing.xl },
  onboardingRoot: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  onboarding: { alignItems: 'center', maxWidth: 448, width: '100%' },
  onboardingTitle: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
    ...typography.md,
  },
  description: {
    fontFamily: 'SUIT',
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
  action: { marginTop: spacing.xl },
});
