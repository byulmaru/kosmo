import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, spacing, typography } from '@/theme/tokens';
import { ProfileListItem } from './ProfileListItem';
import type { InfiniteListRenderer } from '@/components/pagination/InfiniteList';
import type { ProfileConnectionList_followersProfile$key } from './__generated__/ProfileConnectionList_followersProfile.graphql';
import type { ProfileConnectionList_followingProfile$key } from './__generated__/ProfileConnectionList_followingProfile.graphql';
import type { ProfileFollowersNextPageQuery } from './__generated__/ProfileFollowersNextPageQuery.graphql';
import type { ProfileFollowingNextPageQuery } from './__generated__/ProfileFollowingNextPageQuery.graphql';

type ConnectionKind = 'followers' | 'following';

type ProfileConnectionListProps =
  | {
      kind: 'followers';
      listIdentityKey?: string;
      profile: ProfileConnectionList_followersProfile$key;
      renderList?: InfiniteListRenderer;
    }
  | {
      kind: 'following';
      listIdentityKey?: string;
      profile: ProfileConnectionList_followingProfile$key;
      renderList?: InfiniteListRenderer;
    };

const followersFragment = graphql`
  fragment ProfileConnectionList_followersProfile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "ProfileFollowersNextPageQuery") {
    followers(first: $count, after: $cursor) @connection(key: "ProfileConnectionList_followers") {
      edges {
        cursor
        node {
          id
          follower {
            id
            ...ProfileListItem_profile
          }
        }
      }
    }
  }
`;

const followingFragment = graphql`
  fragment ProfileConnectionList_followingProfile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "ProfileFollowingNextPageQuery") {
    following(first: $count, after: $cursor) @connection(key: "ProfileConnectionList_following") {
      edges {
        cursor
        node {
          id
          followee {
            id
            ...ProfileListItem_profile
          }
        }
      }
    }
  }
`;

const copy = {
  followers: {
    emptyDescription: '이 프로필을 팔로우하는 사람이 생기면 여기에 표시돼요.',
    emptyTitle: '아직 팔로워가 없어요',
    errorTitle: '팔로워 목록을 불러오지 못했어요',
    loadError: '팔로워를 더 불러오지 못했어요',
    loadingLabel: '팔로워 목록을 불러오는 중입니다.',
    loadingNextLabel: '팔로워를 더 불러오는 중입니다.',
    title: '팔로워',
  },
  following: {
    emptyDescription: '이 프로필이 팔로우하는 사람이 생기면 여기에 표시돼요.',
    emptyTitle: '아직 팔로잉이 없어요',
    errorTitle: '팔로잉 목록을 불러오지 못했어요',
    loadError: '팔로잉을 더 불러오지 못했어요',
    loadingLabel: '팔로잉 목록을 불러오는 중입니다.',
    loadingNextLabel: '팔로잉을 더 불러오는 중입니다.',
    title: '팔로잉',
  },
} as const;

export function ProfileConnectionList(props: ProfileConnectionListProps) {
  return props.kind === 'followers' ? (
    <FollowersList
      listIdentityKey={props.listIdentityKey}
      profile={props.profile}
      renderList={props.renderList}
    />
  ) : (
    <FollowingList
      listIdentityKey={props.listIdentityKey}
      profile={props.profile}
      renderList={props.renderList}
    />
  );
}

export function ProfileConnectionListState({
  listIdentityKey,
  kind,
  onRetry,
  renderList,
  state,
}: {
  kind: ConnectionKind;
  listIdentityKey?: string;
  onRetry?: () => void;
  renderList?: InfiniteListRenderer;
  state: 'error' | 'loading';
}) {
  const theme = useTheme();
  const text = copy[kind];

  const content = (
    <View>
      <ConnectionTitle kind={kind} />
      {state === 'loading' ? (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2].map((item) => (
              <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
                <Skeleton
                  circular
                  height={40}
                  style={[styles.avatarSkeleton, { borderColor: theme.border }]}
                  width={40}
                />
                <View style={styles.skeletonCopy}>
                  <Skeleton height={12} width={160} />
                  <Skeleton height={12} width={80} />
                </View>
              </View>
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
            {text.loadingLabel}
          </Text>
        </>
      ) : (
        <StateView
          actionLabel={onRetry ? '다시 시도' : undefined}
          alert
          description="잠시 후 다시 시도해주세요."
          onAction={onRetry}
          style={styles.state}
          title={text.errorTitle}
        />
      )}
    </View>
  );

  return renderList
    ? renderList({
        data: [],
        empty: content,
        hasNext: false,
        isLoadingNext: false,
        keyExtractor: () => 'state',
        listIdentityKey,
        loadNext: () => undefined,
        paginationMode: 'manual',
        pageSize: 20,
        renderItem: () => null,
      })
    : content;
}

function FollowersList({
  listIdentityKey,
  profile,
  renderList,
}: {
  listIdentityKey?: string;
  profile: ProfileConnectionList_followersProfile$key;
  renderList?: InfiniteListRenderer;
}) {
  const pagination = usePaginationFragment<
    ProfileFollowersNextPageQuery,
    ProfileConnectionList_followersProfile$key
  >(followersFragment, profile);
  const profiles = pagination.data.followers.edges.flatMap((edge) =>
    edge.node.follower ? [{ cursor: edge.cursor, profile: edge.node.follower }] : [],
  );

  return (
    <ConnectionList
      hasNext={pagination.hasNext}
      isLoadingNext={pagination.isLoadingNext}
      kind="followers"
      listIdentityKey={listIdentityKey}
      loadNext={pagination.loadNext}
      profiles={profiles}
      renderList={renderList}
    />
  );
}

function FollowingList({
  listIdentityKey,
  profile,
  renderList,
}: {
  listIdentityKey?: string;
  profile: ProfileConnectionList_followingProfile$key;
  renderList?: InfiniteListRenderer;
}) {
  const pagination = usePaginationFragment<
    ProfileFollowingNextPageQuery,
    ProfileConnectionList_followingProfile$key
  >(followingFragment, profile);
  const profiles = pagination.data.following.edges.flatMap((edge) =>
    edge.node.followee ? [{ cursor: edge.cursor, profile: edge.node.followee }] : [],
  );

  return (
    <ConnectionList
      hasNext={pagination.hasNext}
      isLoadingNext={pagination.isLoadingNext}
      kind="following"
      listIdentityKey={listIdentityKey}
      loadNext={pagination.loadNext}
      profiles={profiles}
      renderList={renderList}
    />
  );
}

type ConnectionListProps = {
  hasNext: boolean;
  isLoadingNext: boolean;
  kind: keyof typeof copy;
  listIdentityKey?: string;
  loadNext: (count: number, options?: { onComplete?: (error: Error | null) => void }) => void;
  profiles: ReadonlyArray<{
    cursor: string;
    profile: Parameters<typeof ProfileListItem>[0]['profile'];
  }>;
  renderList?: InfiniteListRenderer;
};

function ConnectionList({
  hasNext,
  isLoadingNext,
  kind,
  listIdentityKey,
  loadNext,
  profiles,
  renderList,
}: ConnectionListProps) {
  const theme = useTheme();
  const [loadError, setLoadError] = useState(false);
  const text = copy[kind];
  const loadMore = () => {
    if (isLoadingNext) {
      return;
    }

    setLoadError(false);
    loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  };

  const emptyState = (
    <StateView description={text.emptyDescription} style={styles.state} title={text.emptyTitle} />
  );
  const footer = loadError ? (
    <StateView
      actionLabel="다시 시도"
      alert
      description="잠시 후 다시 시도해주세요."
      onAction={loadMore}
      style={[styles.pagination, { borderColor: theme.border }]}
      title={text.loadError}
    />
  ) : hasNext ? (
    <View style={[styles.pagination, { borderColor: theme.border }]}>
      <Button
        accessibilityState={{ busy: isLoadingNext, disabled: isLoadingNext }}
        disabled={isLoadingNext}
        onPress={loadMore}
        style={styles.paginationAction}
        tone="secondary"
      >
        {isLoadingNext ? '불러오는 중' : '더 불러오기'}
      </Button>
      {isLoadingNext ? (
        <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
          {text.loadingNextLabel}
        </Text>
      ) : null}
    </View>
  ) : null;

  if (renderList) {
    return renderList({
      data: profiles,
      empty: emptyState,
      hasNext,
      isLoadingNext,
      keyExtractor: (item) => item.cursor,
      listHeader: <ConnectionTitle kind={kind} />,
      listIdentityKey,
      loadNext,
      paginationMode: 'manual',
      pageSize: 20,
      renderFooter: () => footer,
      renderItem: ({ item }) => <ProfileListItem linked profile={item.profile} />,
    });
  }

  return (
    <View>
      <ConnectionTitle kind={kind} />
      {profiles.length
        ? profiles.map((item) => (
            <ProfileListItem key={item.cursor} linked profile={item.profile} />
          ))
        : emptyState}
      {footer}
    </View>
  );
}

function ConnectionTitle({ kind }: { kind: ConnectionKind }) {
  const theme = useTheme();

  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { borderColor: theme.border, color: theme.text }]}
    >
      {copy[kind].title}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    borderBottomWidth: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...typography.md,
  },
  state: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  pagination: { alignItems: 'center', borderTopWidth: 1, padding: spacing.lg },
  paginationAction: { marginTop: spacing.md },
  skeletonItem: {
    ...layoutRecipes.listRow,
    borderBottomWidth: 1,
  },
  avatarSkeleton: { borderWidth: 1 },
  skeletonCopy: { flex: 1, gap: spacing.sm, minWidth: 0 },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
