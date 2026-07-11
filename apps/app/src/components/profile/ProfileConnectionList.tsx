import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { ProfileListItem } from './ProfileListItem';
import type { ProfileConnectionList_followersProfile$key } from './__generated__/ProfileConnectionList_followersProfile.graphql';
import type { ProfileConnectionList_followingProfile$key } from './__generated__/ProfileConnectionList_followingProfile.graphql';
import type { ProfileFollowersNextPageQuery } from './__generated__/ProfileFollowersNextPageQuery.graphql';
import type { ProfileFollowingNextPageQuery } from './__generated__/ProfileFollowingNextPageQuery.graphql';

type ConnectionKind = 'followers' | 'following';

type ProfileConnectionListProps =
  | { kind: 'followers'; profile: ProfileConnectionList_followersProfile$key }
  | { kind: 'following'; profile: ProfileConnectionList_followingProfile$key };

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
    <FollowersList profile={props.profile} />
  ) : (
    <FollowingList profile={props.profile} />
  );
}

export function ProfileConnectionListState({
  kind,
  onRetry,
  state,
}: {
  kind: ConnectionKind;
  onRetry?: () => void;
  state: 'error' | 'loading';
}) {
  const theme = useTheme();
  const text = copy[kind];

  return (
    <View>
      <ConnectionTitle kind={kind} />
      {state === 'loading' ? (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2].map((item) => (
              <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
                <View
                  style={[
                    styles.avatarSkeleton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
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
        <View accessibilityRole="alert" style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>{text.errorTitle}</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            잠시 후 다시 시도해주세요.
          </Text>
          {onRetry ? (
            <Button onPress={onRetry} style={styles.stateAction} tone="secondary">
              다시 시도
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

function FollowersList({ profile }: { profile: ProfileConnectionList_followersProfile$key }) {
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
      loadNext={pagination.loadNext}
      profiles={profiles}
    />
  );
}

function FollowingList({ profile }: { profile: ProfileConnectionList_followingProfile$key }) {
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
      loadNext={pagination.loadNext}
      profiles={profiles}
    />
  );
}

type ConnectionListProps = {
  hasNext: boolean;
  isLoadingNext: boolean;
  kind: keyof typeof copy;
  loadNext: (count: number, options?: { onComplete?: (error: Error | null) => void }) => void;
  profiles: ReadonlyArray<{
    cursor: string;
    profile: Parameters<typeof ProfileListItem>[0]['profile'];
  }>;
};

function ConnectionList({ hasNext, isLoadingNext, kind, loadNext, profiles }: ConnectionListProps) {
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

  return (
    <View>
      <ConnectionTitle kind={kind} />
      {profiles.length ? (
        profiles.map((item) => <ProfileListItem key={item.cursor} linked profile={item.profile} />)
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>{text.emptyTitle}</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            {text.emptyDescription}
          </Text>
        </View>
      )}
      {hasNext || loadError ? (
        <View style={[styles.pagination, { borderColor: theme.border }]}>
          {loadError ? (
            <>
              <Text accessibilityRole="alert" style={[styles.stateTitle, { color: theme.text }]}>
                {text.loadError}
              </Text>
              <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
                잠시 후 다시 시도해주세요.
              </Text>
            </>
          ) : null}
          <Button
            accessibilityState={{ busy: isLoadingNext, disabled: isLoadingNext }}
            disabled={isLoadingNext}
            onPress={loadMore}
            style={styles.paginationAction}
            tone="secondary"
          >
            {isLoadingNext ? '불러오는 중' : loadError ? '다시 시도' : '더 불러오기'}
          </Button>
          {isLoadingNext ? (
            <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
              {text.loadingNextLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
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
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: {
    fontFamily: 'SUIT',
    marginTop: spacing.xs,
    textAlign: 'center',
    ...typography.sm,
  },
  stateAction: { marginTop: spacing.lg },
  pagination: { alignItems: 'center', borderTopWidth: 1, padding: spacing.lg },
  paginationAction: { marginTop: spacing.md },
  skeletonItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatarSkeleton: { borderRadius: radii.full, borderWidth: 1, height: 40, width: 40 },
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
