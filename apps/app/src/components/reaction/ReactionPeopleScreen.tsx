import { ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { ReactionPeopleFilter } from './ReactionPeopleFilter';
import { ReactionProfileConnection } from './ReactionProfileConnection';
import { ReactionProfileList } from './ReactionProfileList';
import type { ReactElement, ReactNode } from 'react';
import type { Text } from 'react-native';
import type { ReactionPeopleScreenQuery } from './__generated__/ReactionPeopleScreenQuery.graphql';
import type { ReactionSummaryEntry } from './ReactionSummary';

const reactionPeopleScreenQuery = graphql`
  query ReactionPeopleScreenQuery($postId: ID!, $reactionType: String!) {
    node(id: $postId) {
      __typename
      ... on Post {
        ...ReactionProfileConnection_post
          @arguments(reactionType: $reactionType)
          @alias(as: "reactionProfileConnection")
      }
    }
  }
`;

export type ReactionPeopleScreenProps = Readonly<{
  onTypeChange: (reactionType: string) => void;
  postId: string;
  reactionCounts: ReadonlyArray<ReactionSummaryEntry>;
  reactionType: string;
}>;

export function ReactionPeopleScreen({
  onTypeChange,
  postId,
  reactionCounts,
  reactionType,
}: ReactionPeopleScreenProps): ReactElement {
  return (
    <View style={styles.content}>
      <ReactionPeopleFilter
        entries={reactionCounts}
        onValueChange={onTypeChange}
        value={reactionType}
      />
      <RouteBoundary
        error={(retry) => (
          <ReactionProfileList
            error
            onRetry={retry}
            presentation="route"
            reactionType={reactionType}
          />
        )}
        key={`${postId}:${reactionType}`}
        loading={<ReactionProfileList loading presentation="route" reactionType={reactionType} />}
        title="반응한 프로필을 불러오지 못했어요"
      >
        <ReactionPeopleContent postId={postId} reactionType={reactionType} />
      </RouteBoundary>
    </View>
  );
}

export function ReactionPeopleHeader({ onBack }: { onBack: () => void }): ReactElement {
  const theme = useTheme();
  const headingRef = useRef<Text>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      if (headingRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus');
      }
      return;
    }

    const heading = headingRef.current as unknown as HTMLElement | null;
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, []);

  return (
    <View style={styles.header}>
      <PageHeader
        leading={
          <IconButton
            accessibilityLabel="뒤로 가기"
            feedback="opacity-hover"
            onPress={onBack}
            style={styles.back}
            targetSize={44}
            visualSize={44}
          >
            <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
          </IconButton>
        }
        titleRef={headingRef}
        title="반응한 사람"
      />
    </View>
  );
}

export function ReactionPeopleRouteFrame({
  children,
  onBack,
  scrollKey,
}: {
  children?: ReactNode;
  onBack: () => void;
  scrollKey: string;
}) {
  return (
    <ReactionPeopleRouteContainer scrollKey={scrollKey}>
      <ReactionPeopleHeader onBack={onBack} />
      {children}
    </ReactionPeopleRouteContainer>
  );
}

function ReactionPeopleContent({ postId, reactionType }: { postId: string; reactionType: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ReactionPeopleScreenQuery>(
    reactionPeopleScreenQuery,
    { postId, reactionType },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.node?.__typename === 'Post' && data.node.reactionProfileConnection ? (
    <ReactionProfileConnection
      post={data.node.reactionProfileConnection}
      presentation="route"
      reactionType={reactionType}
    />
  ) : (
    <StateView title="게시글을 찾을 수 없어요" />
  );
}

export function ReactionPeopleRouteContainer({
  children,
  scrollKey,
}: {
  children?: ReactNode;
  scrollKey: string;
}) {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : (
    <PaginationScrollView key={scrollKey} nativeScrollProps={{ style: styles.nativeRoot }}>
      {children}
    </PaginationScrollView>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  nativeRoot: { flex: 1 },
  header: { width: '100%' },
  webRoot: { width: '100%' },
});
