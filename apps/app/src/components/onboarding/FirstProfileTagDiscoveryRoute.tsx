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
import { spacing, textStyles } from '@/theme/tokens';
import { FirstProfileOnboardingFrame } from './FirstProfileOnboardingFrame';
import type { ComponentProps, ReactNode } from 'react';
import type { LoadNext } from '@/components/pagination/useAutomaticPagination';
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
  onBack: () => void;
  profileId: string;
};

type RenderFrame = (content: ReactNode, disabled: boolean) => ReactNode;

export function FirstProfileTagDiscoveryRoute({ empty, onBack, onContinue, profileId }: Props) {
  const theme = useTheme();
  const safeArea = useSafeAreaPadding();
  const renderFrame: RenderFrame = (content, disabled) => (
    <FirstProfileOnboardingFrame
      title={'관심사가 같은 사람을\n만나보세요'}
      description="나와 취향이 같은 사람들을 둘러보고, 마음에 드는 사람을 팔로우해 보세요."
      onBack={onBack}
      disabled={disabled}
      style={styles.frame}
      actions={<Button onPress={onContinue}>계속하기</Button>}
    >
      <View style={styles.content}>{content}</View>
    </FirstProfileOnboardingFrame>
  );
  return (
    <View style={[styles.root, safeArea, { backgroundColor: theme.backgroundCanvas }]}>
      <RouteBoundary
        error={(retry) =>
          renderFrame(
            <DiscoveryState
              actionLabel="다시 시도"
              alert
              onAction={retry}
              title="저장한 태그를 불러오지 못했어요"
            />,
            false,
          )
        }
        loading={renderFrame(
          <DiscoveryState loading title="저장한 태그를 불러오는 중이에요" />,
          true,
        )}
        title="저장한 태그를 불러오지 못했어요"
      >
        <SavedTagQuery empty={empty} profileId={profileId} renderFrame={renderFrame} />
      </RouteBoundary>
    </View>
  );
}

function SavedTagQuery({
  empty,
  profileId,
  renderFrame,
}: Pick<Props, 'empty' | 'profileId'> & { renderFrame: RenderFrame }) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryQuery>(
    query,
    { profileId },
    { fetchKey, fetchPolicy: 'network-only' },
  );
  if (data.node?.__typename !== 'Profile' || !data.node.profile) {
    return renderFrame(
      <DiscoveryState
        actionLabel="다시 시도"
        alert
        onAction={refetch}
        title="저장한 태그를 확인할 수 없어요"
      />,
      false,
    );
  }
  return <SavedTags empty={empty} profile={data.node.profile} renderFrame={renderFrame} />;
}

function SavedTags({
  empty,
  profile,
  renderFrame,
}: {
  empty: ReactNode;
  profile: FirstProfileTagDiscovery_profile$key;
  renderFrame: RenderFrame;
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
                error={(retry) =>
                  renderFrame(
                    <>
                      {renderControls(!active)}
                      <DiscoveryState
                        actionLabel="다시 시도"
                        alert
                        description="잠시 후 다시 시도해주세요."
                        onAction={retry}
                        title={`#${tag.name} 관련 프로필을 불러오지 못했어요`}
                      />
                    </>,
                    !active,
                  )
                }
                loading={renderFrame(
                  <>
                    {renderControls(true)}
                    <DiscoveryState
                      loading
                      title={`#${tag.name} 관련 프로필을 불러오는 중이에요`}
                    />
                  </>,
                  true,
                )}
                title={`#${tag.name} 관련 프로필을 불러오지 못했어요`}
              >
                <TagQuery
                  active={active}
                  hashtagId={tag.id}
                  renderControls={renderControls}
                  renderFrame={renderFrame}
                />
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
  renderFrame,
}: {
  active: boolean;
  hashtagId: string;
  renderControls: (disabled: boolean) => ReactNode;
  renderFrame: RenderFrame;
}) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryTagQuery>(
    tagQuery,
    { hashtagId },
    { fetchKey, fetchPolicy: 'network-only' },
  );
  if (data.node?.__typename !== 'Hashtag' || !data.node.relatedProfiles) {
    return renderFrame(
      <>
        {renderControls(!active)}
        <DiscoveryState
          actionLabel="다시 시도"
          alert
          onAction={refetch}
          title="이 태그의 관련 프로필을 확인할 수 없어요"
        />
      </>,
      !active,
    );
  }
  return (
    <RelatedProfiles
      active={active}
      hashtag={data.node.relatedProfiles}
      renderControls={renderControls}
      renderFrame={renderFrame}
    />
  );
}

function RelatedProfiles({
  active,
  hashtag,
  renderControls,
  renderFrame,
}: {
  active: boolean;
  hashtag: FirstProfileTagDiscoveryList_hashtag$key;
  renderControls: (disabled: boolean) => ReactNode;
  renderFrame: RenderFrame;
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
          renderFrame={renderFrame}
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
  renderFrame,
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
  renderFrame: RenderFrame;
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

  return renderFrame(
    <View style={styles.content}>
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
    </View>,
    !active || mutationLoading || pagination.isLoadingNext,
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
  hidden: { display: 'none' },
  list: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: spacing.lg },
});
