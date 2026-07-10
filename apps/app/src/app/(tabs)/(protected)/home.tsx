import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { HomePageQuery } from './__generated__/HomePageQuery.graphql';

const HomeQuery = graphql`
  query HomePageQuery {
    currentSession {
      id
      selectedProfile {
        id
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
  const theme = useTheme();
  const router = useRouter();
  const { revision } = useRelayActor();
  const data = useLazyLoadQuery<HomePageQuery>(
    HomeQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  const selectedProfile = data.currentSession?.selectedProfile ?? null;
  const hasProfiles = (data.me?.profiles?.length ?? 0) > 0;

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
        <Text style={[styles.title, { color: theme.text }]}>홈</Text>
      </View>
      {!selectedProfile ? (
        <View
          style={[styles.onboarding, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.onboardingTitle, { color: theme.text }]}>
            {hasProfiles ? '사용할 프로필을 선택해 주세요' : '첫 프로필을 만들어 보세요'}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            메뉴의 프로필 전환기에서 프로필을 만들거나 선택하면 타임라인을 시작할 수 있어요.
          </Text>
          <Button onPress={() => router.push('/menu')}>프로필 설정 열기</Button>
        </View>
      ) : (
        <PostList homeTimeline={data.homeTimeline} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  heading: { gap: spacing.sm },
  eyebrow: { fontFamily: 'SUIT', fontWeight: '700', letterSpacing: 1.6, ...typography.xsm },
  title: { fontFamily: 'SUIT', fontSize: 44, fontWeight: '800', lineHeight: 48 },
  onboarding: { borderRadius: 16, borderWidth: 1, gap: spacing.md, padding: spacing.xl },
  onboardingTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  description: { fontFamily: 'SUIT', ...typography.sm },
});
