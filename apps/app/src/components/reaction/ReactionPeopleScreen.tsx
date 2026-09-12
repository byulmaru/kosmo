import { ChevronLeftIcon } from 'lucide-react-native';
import { forwardRef, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
import type { ReactElement } from 'react';
import type { ScrollView, View as NativeView } from 'react-native';
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
  onBack: () => void;
  onTypeChange: (reactionType: string) => void;
  postId: string;
  reactionCounts: ReadonlyArray<ReactionSummaryEntry>;
  reactionType: string;
}>;

export function ReactionPeopleScreen({
  onBack,
  onTypeChange,
  postId,
  reactionCounts,
  reactionType,
}: ReactionPeopleScreenProps): ReactElement {
  const scrollRef = useRef<ScrollView>(null);
  const previousReactionType = useRef(reactionType);

  useEffect(() => {
    if (previousReactionType.current === reactionType) {
      return;
    }
    previousReactionType.current = reactionType;
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    } else {
      scrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
    }
  }, [reactionType]);

  return (
    <ReactionPeopleRouteContainer ref={scrollRef} scrollKey={postId}>
      <ReactionPeopleHeader onBack={onBack} />
      <View style={styles.content}>
        <ReactionPeopleFilter
          entries={reactionCounts}
          onValueChange={onTypeChange}
          value={reactionType}
        />
        <RouteBoundary
          error={(retry) => (
            <ReactionProfileList error onRetry={retry} reactionType={reactionType} />
          )}
          key={`${postId}:${reactionType}`}
          loading={<ReactionProfileList loading reactionType={reactionType} />}
          title="반응한 프로필을 불러오지 못했어요"
        >
          <ReactionPeopleContent postId={postId} reactionType={reactionType} />
        </RouteBoundary>
      </View>
    </ReactionPeopleRouteContainer>
  );
}

export function ReactionPeopleHeader({ onBack }: { onBack: () => void }): ReactElement {
  const theme = useTheme();
  const headerRef = useRef<NativeView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const header = headerRef.current as unknown as {
      querySelector?: (selectors: string) => HTMLElement | null;
    } | null;
    const heading = header?.querySelector?.('[role="heading"]');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, []);

  return (
    <View ref={headerRef} style={styles.header}>
      <PageHeader
        leading={
          <IconButton
            accessibilityLabel="뒤로 가기"
            onPress={onBack}
            style={styles.back}
            targetSize={44}
            visualSize={44}
          >
            <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
          </IconButton>
        }
        title="반응한 사람"
      />
    </View>
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
      reactionType={reactionType}
    />
  ) : (
    <StateView title="게시글을 찾을 수 없어요" />
  );
}

const ReactionPeopleRouteContainer = forwardRef<
  ScrollView,
  {
    children: ReactElement | ReactElement[];
    scrollKey: string;
  }
>(({ children, scrollKey }, ref) => {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : (
    <PaginationScrollView key={scrollKey} ref={ref} style={styles.nativeRoot}>
      {children}
    </PaginationScrollView>
  );
});

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
