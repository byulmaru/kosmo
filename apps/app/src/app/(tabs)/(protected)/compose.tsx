import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostComposer } from '@/components/post/PostComposer';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
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
  const router = useRouter();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <PageHeader title="글쓰기" />
      <View style={styles.content}>
        <RouteBoundary
          error={(retry) => (
            <ComposeStateCard
              alert
              description="잠시 후 다시 시도해주세요."
              onAction={retry}
              title="글쓰기 정보를 불러오지 못했어요"
            />
          )}
          loading={<ComposeLoading />}
          onRetry={() => setFetchKey((key) => key + 1)}
          title="글쓰기 정보를 불러오지 못했어요"
        >
          <ComposeContent
            fetchKey={`${revision}:${fetchKey}`}
            onGoHome={() => router.push('/home')}
          />
        </RouteBoundary>
      </View>
    </ScrollView>
  );
}

function ComposeContent({ fetchKey, onGoHome }: { fetchKey: string; onGoHome: () => void }) {
  const data = useLazyLoadQuery<ComposePageQuery>(
    ComposeQuery,
    {},
    { fetchKey, fetchPolicy: 'store-or-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? (
    <PostComposer profile={profile} />
  ) : (
    <ComposeStateCard
      description="홈에서 프로필을 만들거나 선택한 뒤 글을 쓸 수 있어요."
      onAction={onGoHome}
      title="프로필이 필요해요"
    />
  );
}

function ComposeLoading() {
  const theme = useTheme();

  return (
    <>
      <View
        accessibilityElementsHidden
        style={[styles.loadingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <Skeleton height={20} width={144} />
        <Skeleton height={160} />
        <View style={styles.loadingAction}>
          <Skeleton height={40} width={120} />
        </View>
      </View>
      <Text role="status" style={styles.srOnly}>
        글쓰기 화면을 불러오는 중입니다.
      </Text>
    </>
  );
}

function ComposeStateCard({
  alert = false,
  description,
  onAction,
  title,
}: {
  alert?: boolean;
  description: string;
  onAction: () => void;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole={alert ? 'alert' : undefined}
      style={[styles.stateCard, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>{description}</Text>
      <View style={styles.stateAction}>
        <Button onPress={onAction} tone="secondary">
          {alert ? '다시 시도' : '홈으로 이동'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    width: '100%',
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: 20,
    maxWidth: 624,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: '100%',
  },
  loadingCard: {
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  loadingAction: { alignItems: 'flex-end' },
  stateCard: {
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: 20,
  },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  stateDescription: { fontFamily: 'SUIT', marginTop: spacing.xs, ...typography.sm },
  stateAction: { alignItems: 'flex-start', marginTop: spacing.lg },
  srOnly: { height: 1, opacity: 0, overflow: 'hidden', position: 'absolute', width: 1 },
});
