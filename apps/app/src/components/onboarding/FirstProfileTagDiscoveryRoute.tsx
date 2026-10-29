import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, textStyles } from '@/theme/tokens';
import { FirstProfileOnboardingFrame } from './FirstProfileOnboardingFrame';
import type { ComponentProps, ReactNode } from 'react';
import type { FirstProfileTagDiscovery_profile$key } from './__generated__/FirstProfileTagDiscovery_profile.graphql';
import type { FirstProfileTagDiscoveryList_hashtag$key } from './__generated__/FirstProfileTagDiscoveryList_hashtag.graphql';
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
      <FirstProfileOnboardingFrame
        title={'관심사가 같은 사람을\n만나보세요'}
        description="나와 취향이 같은 사람들을 둘러보고, 마음에 드는 사람을 팔로우해 보세요."
        style={styles.frame}
        actions={<Button onPress={onContinue}>계속하기</Button>}
      >
        <View style={styles.content}>
          <RouteBoundary
            error={(retry) => (
              <DiscoveryState
                actionLabel="다시 시도"
                alert
                onAction={retry}
                title="저장한 태그를 불러오지 못했어요"
              />
            )}
            loading={<DiscoveryState loading title="저장한 태그를 불러오는 중이에요" />}
            title="저장한 태그를 불러오지 못했어요"
          >
            <SavedTagQuery empty={empty} profileId={profileId} />
          </RouteBoundary>
        </View>
      </FirstProfileOnboardingFrame>
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
      <DiscoveryState
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
  const selected = tags.find((tag) => tag.id === selectedId) ?? tags[0];
  const theme = useTheme();

  if (!selected) {
    return empty;
  }

  return (
    <View style={styles.content}>
      <ScrollView contentContainerStyle={styles.tags} style={styles.tagSelector}>
        {tags.map((tag) => (
          <Button
            accessibilityLabel={`#${tag.name}`}
            aria-pressed={tag.id === selected.id}
            accessibilityState={{ selected: tag.id === selected.id }}
            key={tag.id}
            onPress={() => setSelectedId(tag.id)}
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
      <RouteBoundary
        key={selected.id}
        error={(retry) => (
          <DiscoveryState
            actionLabel="다시 시도"
            alert
            description="잠시 후 다시 시도해주세요."
            onAction={retry}
            title={`#${selected.name} 관련 프로필을 불러오지 못했어요`}
          />
        )}
        loading={
          <DiscoveryState loading title={`#${selected.name} 관련 프로필을 불러오는 중이에요`} />
        }
        title={`#${selected.name} 관련 프로필을 불러오지 못했어요`}
      >
        <TagQuery hashtagId={selected.id} />
      </RouteBoundary>
    </View>
  );
}

function TagQuery({ hashtagId }: { hashtagId: string }) {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryTagQuery>(
    tagQuery,
    { hashtagId },
    { fetchKey, fetchPolicy },
  );
  if (data.node?.__typename !== 'Hashtag' || !data.node.relatedProfiles) {
    return (
      <DiscoveryState
        actionLabel="다시 시도"
        alert
        onAction={refetch}
        title="이 태그의 관련 프로필을 확인할 수 없어요"
      />
    );
  }
  return <RelatedProfiles hashtag={data.node.relatedProfiles} />;
}

function RelatedProfiles({ hashtag }: { hashtag: FirstProfileTagDiscoveryList_hashtag$key }) {
  const pagination = usePaginationFragment<
    FirstProfileTagDiscoveryNextPageQuery,
    FirstProfileTagDiscoveryList_hashtag$key
  >(listFragment, hashtag);
  const profiles = pagination.data.relatedProfiles.edges;
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: profiles.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });

  return (
    <ScrollView {...nativeScrollProps} contentContainerStyle={styles.list} style={styles.content}>
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
        error={loadError}
        errorMessage="관련 프로필을 더 불러오지 못했어요"
        hasNext={pagination.hasNext}
        isLoading={pagination.isLoadingNext}
        loadingLabel="관련 프로필을 더 불러오는 중"
        onRetry={loadNextPage}
        style={styles.pagination}
      />
    </ScrollView>
  );
}

function DiscoveryState(props: ComponentProps<typeof StateView>) {
  return (
    <ScrollView style={styles.content}>
      <StateView {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1 },
  frame: { alignSelf: 'center', flex: 1, minHeight: 0 },
  content: { flex: 1, minHeight: 0, width: '100%' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagSelector: { flexGrow: 0, flexShrink: 1, maxHeight: '40%' },
  tag: { maxWidth: '100%' },
  listTitle: {
    ...textStyles.uiHeadingS,
    paddingVertical: spacing.sm,
  },
  list: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: spacing.lg },
});
