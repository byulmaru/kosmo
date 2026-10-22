import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { FollowButtonGroup } from '@/components/profile/FollowButton';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, spacing, textStyles } from '@/theme/tokens';
import type { LoadNext } from '@/components/pagination/useAutomaticPagination';
import type { ReactNode } from 'react';
import type { FirstProfileTagDiscovery_profile$key } from './__generated__/FirstProfileTagDiscovery_profile.graphql';
import type {
  FirstProfileTagDiscoveryList_hashtag$data,
  FirstProfileTagDiscoveryList_hashtag$key,
} from './__generated__/FirstProfileTagDiscoveryList_hashtag.graphql';
import type { FirstProfileTagDiscoveryNextPageQuery } from './__generated__/FirstProfileTagDiscoveryNextPageQuery.graphql';
import type { FirstProfileTagDiscoveryQuery } from './__generated__/FirstProfileTagDiscoveryQuery.graphql';
import type { FirstProfileTagDiscoveryTagQuery } from './__generated__/FirstProfileTagDiscoveryTagQuery.graphql';

const query = graphql`
  query FirstProfileTagDiscoveryQuery($profileId: ID!) @throwOnFieldError {
    node(id: $profileId) {
      __typename
      ... on Profile {
        ...FirstProfileTagDiscovery_profile @alias(as: "profile")
      }
    }
  }
`;

const profileFragment = graphql`
  fragment FirstProfileTagDiscovery_profile on Profile {
    tags {
      id
      name
    }
  }
`;

const tagQuery = graphql`
  query FirstProfileTagDiscoveryTagQuery($hashtagId: ID!) @throwOnFieldError {
    node(id: $hashtagId) {
      __typename
      ... on Hashtag {
        ...FirstProfileTagDiscoveryList_hashtag @alias(as: "relatedProfiles")
      }
    }
  }
`;

const listFragment = graphql`
  fragment FirstProfileTagDiscoveryList_hashtag on Hashtag
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "FirstProfileTagDiscoveryNextPageQuery") {
    relatedProfiles(first: $count, after: $cursor)
      @connection(key: "FirstProfileTagDiscoveryList_relatedProfiles") {
      edges {
        cursor
        node {
          ...ProfileListItem_profile
        }
      }
    }
  }
`;

type Props = {
  empty: ReactNode;
  onContinue: () => void;
  profileId: string;
};

export function FirstProfileTagDiscoveryRoute({ empty, onContinue, profileId }: Props) {
  const theme = useTheme();
  const safeArea = useSafeAreaPadding();
  return (
    <View style={[styles.root, safeArea, { backgroundColor: theme.backgroundCanvas }]}>
      <View style={styles.screen}>
        <View style={styles.intro}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foregroundPrimary }]}
          >
            관심사가 같은 사람을 만나보세요
          </Text>
          <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
            프로필에 저장한 태그를 골라 둘러보고, 마음에 드는 사람을 팔로우해 보세요.
          </Text>
        </View>
        <View style={styles.content}>
          <RouteBoundary
            loading={<StateView loading title="저장한 태그를 불러오는 중이에요" />}
            title="저장한 태그를 불러오지 못했어요"
          >
            <SavedTagQuery empty={empty} profileId={profileId} />
          </RouteBoundary>
        </View>
        <View style={[styles.actions, { borderColor: theme.border }]}>
          <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
            팔로우하지 않아도 지금은 넘어갈 수 있어요.
          </Text>
          <Button onPress={onContinue}>계속하기</Button>
        </View>
      </View>
    </View>
  );
}

function SavedTagQuery({ empty, profileId }: Pick<Props, 'empty' | 'profileId'>) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryQuery>(
    query,
    { profileId },
    { fetchKey, fetchPolicy: 'network-only' },
  );
  if (data.node?.__typename !== 'Profile' || !data.node.profile) {
    return (
      <StateView
        actionLabel="다시 시도"
        alert
        onAction={refetch}
        title="저장한 태그를 확인할 수 없어요"
      />
    );
  }
  return <SavedTags empty={empty} profile={data.node.profile} />;
}

function SavedTags({
  empty,
  profile,
}: {
  empty: ReactNode;
  profile: FirstProfileTagDiscovery_profile$key;
}) {
  const { tags } = useFragment(profileFragment, profile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<readonly string[]>([]);
  const selected = tags.find((tag) => tag.id === selectedId) ?? tags[0];
  const theme = useTheme();

  if (!selected) {
    return empty;
  }

  const renderControls = (disabled: boolean) => (
    <>
      <ScrollView contentContainerStyle={styles.tags} style={styles.tagSelector}>
        {tags.map((tag) => (
          <Button
            accessibilityLabel={`#${tag.name}`}
            aria-pressed={tag.id === selected.id}
            accessibilityState={{ disabled, selected: tag.id === selected.id }}
            disabled={disabled}
            key={tag.id}
            onPress={() => {
              if (disabled) {
                return;
              }
              setVisitedIds((current) =>
                current.includes(selected.id) ? current : [...current, selected.id],
              );
              setSelectedId(tag.id);
            }}
            size="compact"
            style={styles.tag}
            tone={tag.id === selected.id ? 'primary' : 'secondary'}
          >
            {`${tag.id === selected.id ? '✓ ' : ''}#${tag.name}`}
          </Button>
        ))}
      </ScrollView>
      <Text
        accessibilityRole="header"
        style={[styles.listTitle, { color: theme.foregroundPrimary }]}
      >
        #{selected.name} 관련 프로필
      </Text>
    </>
  );

  return (
    <View style={styles.content}>
      {tags
        .filter((tag) => tag.id === selected.id || visitedIds.includes(tag.id))
        .map((tag) => {
          const active = tag.id === selected.id;
          return (
            <View
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              key={tag.id}
              style={[styles.content, !active && styles.hidden]}
            >
              <RouteBoundary
                error={(retry) => (
                  <>
                    {renderControls(!active)}
                    <StateView
                      actionLabel="다시 시도"
                      alert
                      description="잠시 후 다시 시도해주세요."
                      onAction={retry}
                      title={`#${tag.name} 관련 프로필을 불러오지 못했어요`}
                    />
                  </>
                )}
                loading={
                  <>
                    {renderControls(true)}
                    <StateView loading title={`#${tag.name} 관련 프로필을 불러오는 중이에요`} />
                  </>
                }
                title={`#${tag.name} 관련 프로필을 불러오지 못했어요`}
              >
                <TagQuery active={active} hashtagId={tag.id} renderControls={renderControls} />
              </RouteBoundary>
            </View>
          );
        })}
    </View>
  );
}

function TagQuery({
  active,
  hashtagId,
  renderControls,
}: {
  active: boolean;
  hashtagId: string;
  renderControls: (disabled: boolean) => ReactNode;
}) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryTagQuery>(
    tagQuery,
    { hashtagId },
    { fetchKey, fetchPolicy: 'network-only' },
  );
  if (data.node?.__typename !== 'Hashtag' || !data.node.relatedProfiles) {
    return (
      <>
        {renderControls(!active)}
        <StateView
          actionLabel="다시 시도"
          alert
          onAction={refetch}
          title="이 태그의 관련 프로필을 확인할 수 없어요"
        />
      </>
    );
  }
  return (
    <RelatedProfiles
      active={active}
      hashtag={data.node.relatedProfiles}
      renderControls={renderControls}
    />
  );
}

function RelatedProfiles({
  active,
  hashtag,
  renderControls,
}: {
  active: boolean;
  hashtag: FirstProfileTagDiscoveryList_hashtag$key;
  renderControls: (disabled: boolean) => ReactNode;
}) {
  const pagination = usePaginationFragment<
    FirstProfileTagDiscoveryNextPageQuery,
    FirstProfileTagDiscoveryList_hashtag$key
  >(listFragment, hashtag);
  return (
    <FollowButtonGroup disabled={!active || pagination.isLoadingNext}>
      {(mutationLoading) => (
        <RelatedProfilesContent
          active={active}
          mutationLoading={mutationLoading}
          pagination={pagination}
          renderControls={renderControls}
        />
      )}
    </FollowButtonGroup>
  );
}

function RelatedProfilesContent({
  active,
  mutationLoading,
  pagination,
  renderControls,
}: {
  active: boolean;
  mutationLoading: boolean;
  pagination: {
    data: FirstProfileTagDiscoveryList_hashtag$data;
    hasNext: boolean;
    isLoadingNext: boolean;
    loadNext: LoadNext;
  };
  renderControls: (disabled: boolean) => ReactNode;
}) {
  const profiles = pagination.data.relatedProfiles.edges;
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: active && !mutationLoading && pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: profiles.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });

  return (
    <>
      {renderControls(!active || mutationLoading || pagination.isLoadingNext)}
      <ScrollView {...nativeScrollProps} contentContainerStyle={styles.list}>
        {profiles.length ? (
          profiles.map((edge) => (
            <ProfileListItem key={edge.cursor} linked profile={edge.node} showBio />
          ))
        ) : (
          <StateView
            description="다른 태그를 골라 보거나 지금은 넘어갈 수 있어요."
            title="관련 프로필이 없어요"
          />
        )}
        <PaginationSurface
          endRef={endRef}
          error={active && loadError}
          errorMessage="관련 프로필을 더 불러오지 못했어요"
          hasNext={active && pagination.hasNext}
          isLoading={pagination.isLoadingNext}
          loadingLabel="관련 프로필을 더 불러오는 중"
          onRetry={active && !mutationLoading ? loadNextPage : undefined}
          style={styles.pagination}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1 },
  screen: { flex: 1, maxWidth: breakpoints.compact, width: '100%' },
  intro: { gap: spacing.sm, padding: spacing.lg },
  title: textStyles.uiHeadingM,
  description: textStyles.uiCopyM,
  content: { flex: 1, minHeight: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg },
  tagSelector: { flexGrow: 0, flexShrink: 1, maxHeight: '40%' },
  tag: { maxWidth: '100%' },
  listTitle: {
    ...textStyles.uiHeadingS,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  hidden: { display: 'none' },
  list: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: spacing.lg },
  actions: { borderTopWidth: 1, gap: spacing.sm, padding: spacing.lg },
});
