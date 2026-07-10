import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostComposer } from '@/components/post/PostComposer';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { ComposePageQuery } from './__generated__/ComposePageQuery.graphql';

const ComposeQuery = graphql`
  query ComposePageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...PostComposer_profile
      }
    }
  }
`;

export default function ComposeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { revision } = useRelayActor();
  const data = useLazyLoadQuery<ComposePageQuery>(
    ComposeQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-or-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
      <Text style={[styles.title, { color: theme.text }]}>글쓰기</Text>
      {profile ? (
        <PostComposer profile={profile} />
      ) : (
        <>
          <StateView
            description="홈에서 프로필을 만들거나 선택한 뒤 글을 쓸 수 있어요."
            title="프로필이 필요해요"
          />
          <Button onPress={() => router.push('/home')} tone="secondary">
            홈으로 이동
          </Button>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  eyebrow: { fontFamily: 'SUIT', fontWeight: '700', letterSpacing: 1.6, ...typography.xsm },
  title: { fontFamily: 'SUIT', fontSize: 36, fontWeight: '800', lineHeight: 42 },
});
