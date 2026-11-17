import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { ComponentProps } from 'react';
import type { LoadNext } from '@/components/pagination/useAutomaticPagination';
import type { FirstProfileTagDiscovery_profile$key } from './__generated__/FirstProfileTagDiscovery_profile.graphql';
import type { FirstProfileTagDiscoveryList_hashtag$key } from './__generated__/FirstProfileTagDiscoveryList_hashtag.graphql';
import type { FirstProfileTagDiscoveryNextPageQuery } from './__generated__/FirstProfileTagDiscoveryNextPageQuery.graphql';
import type { FirstProfileTagDiscoveryQuery } from './__generated__/FirstProfileTagDiscoveryQuery.graphql';
import type { FirstProfileTagDiscoveryTagQuery } from './__generated__/FirstProfileTagDiscoveryTagQuery.graphql';
import type {
  FirstProfileOnboardingAnalytics,
  FirstProfileOperationToken,
} from './firstProfileOnboardingAnalytics';

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
  analytics: FirstProfileOnboardingAnalytics;
  onContinue: () => void;
  onNoSavedTags: () => void;
  profileId: string;
};

export function FirstProfileTagDiscoveryRoute({
  analytics,
  onContinue,
  onNoSavedTags,
  profileId,
}: Props) {
  const theme = useTheme();
  const safeArea = useSafeAreaPadding();
  const [savedTagToken, setSavedTagToken] = useState<FirstProfileOperationToken | null>(null);
  const startSavedTagOperation = useCallback(
    (retry?: () => void, actionSequence?: number) => {
      const token = analytics.beginOperation('discovery', 'load_saved_tags', actionSequence);
      setSavedTagToken(token);
      retry?.();
      return token;
    },
    [analytics],
  );
  const retrySavedTagOperation = useCallback(
    (retry?: () => void) => {
      const actionSequence = analytics.action('discovery', 'retry');
      startSavedTagOperation(retry, actionSequence);
    },
    [analytics, startSavedTagOperation],
  );
  useEffect(() => {
    const token = startSavedTagOperation();
    return () => analytics.finishOperation(token, 'not_observed');
  }, [analytics, startSavedTagOperation]);
  useEffect(
    () => () => {
      if (savedTagToken) {
        analytics.finishOperation(savedTagToken, 'not_observed');
      }
    },
    [analytics, savedTagToken],
  );

  const continueOnboarding = () => {
    analytics.action('discovery', 'continue');
    analytics.completeOnboarding('continued');
    onContinue();
  };

  return (
    <View style={[styles.root, safeArea, { backgroundColor: theme.backgroundCanvas }]}>
      <FirstProfileOnboardingFrame
        title={'관심사가 같은 사람을\n만나보세요'}
        description="나와 취향이 같은 사람들을 둘러보고, 마음에 드는 사람을 팔로우해 보세요."
        style={styles.frame}
        actions={<Button onPress={continueOnboarding}>계속하기</Button>}
      >
        <View style={styles.content}>
          {savedTagToken ? (
            <RouteBoundary
              error={(retry) => {
                analytics.savedTagsFailed(savedTagToken, 'network');
                return (
                  <DiscoveryState
                    actionLabel="다시 시도"
                    alert
                    onAction={() => retrySavedTagOperation(retry)}
                    title="저장한 태그를 불러오지 못했어요"
                  />
                );
              }}
              loading={<DiscoveryState loading title="저장한 태그를 불러오는 중이에요" />}
              title="저장한 태그를 불러오지 못했어요"
            >
              <SavedTagQuery
                analytics={analytics}
                onNoSavedTags={onNoSavedTags}
                onRetry={retrySavedTagOperation}
                profileId={profileId}
                token={savedTagToken}
              />
            </RouteBoundary>
          ) : (
            <DiscoveryState loading title="저장한 태그를 불러오는 중이에요" />
          )}
        </View>
      </FirstProfileOnboardingFrame>
    </View>
  );
}

function SavedTagQuery({
  analytics,
  onNoSavedTags,
  onRetry,
  profileId,
  token,
}: {
  analytics: FirstProfileOnboardingAnalytics;
  onNoSavedTags: () => void;
  onRetry: (retry?: () => void) => void;
  profileId: string;
  token: FirstProfileOperationToken;
}) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryQuery>(
    query,
    { profileId },
    { fetchKey, fetchPolicy: 'network-only' },
  );
  if (data.node?.__typename !== 'Profile' || !data.node.profile) {
    analytics.savedTagsFailed(token, 'response');
    return (
      <DiscoveryState
        actionLabel="다시 시도"
        alert
        onAction={() => onRetry(refetch)}
        title="저장한 태그를 확인할 수 없어요"
      />
    );
  }
  return (
    <SavedTags
      analytics={analytics}
      onNoSavedTags={onNoSavedTags}
      onRetry={() => onRetry(refetch)}
      profile={data.node.profile}
      token={token}
    />
  );
}

function SavedTags({
  analytics,
  onNoSavedTags,
  onRetry,
  profile,
  token,
}: {
  analytics: FirstProfileOnboardingAnalytics;
  onNoSavedTags: () => void;
  onRetry: () => void;
  profile: FirstProfileTagDiscovery_profile$key;
  token: FirstProfileOperationToken;
}) {
  const { tags } = useFragment(profileFragment, profile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedActionSequence, setSelectedActionSequence] = useState<number | undefined>();
  const theme = useTheme();
  const observedTokenRef = useRef<number | null>(null);
  const hasTags = tags != null && tags.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (hasTags) {
        analytics.viewStep('discovery');
      }
    }, [analytics, hasTags]),
  );

  useEffect(() => {
    if (observedTokenRef.current === token.id) {
      return;
    }
    observedTokenRef.current = token.id;
    if (tags == null) {
      analytics.savedTagsFailed(token, 'response');
      return;
    }
    analytics.savedTagsLoaded(token, tags.length);
    if (tags.length === 0) {
      analytics.completeOnboarding('no_saved_tags');
      onNoSavedTags();
    }
  }, [analytics, onNoSavedTags, tags, token]);

  if (tags == null) {
    return (
      <DiscoveryState
        actionLabel="다시 시도"
        alert
        onAction={onRetry}
        title="저장한 태그를 확인할 수 없어요"
      />
    );
  }

  const selectedIndex = Math.max(
    tags.findIndex((tag) => tag.id === selectedId),
    0,
  );
  const selected = tags[selectedIndex];
  if (!selected) {
    return null;
  }

  return (
    <View style={styles.content}>
      <ScrollView contentContainerStyle={styles.tags} style={styles.tagSelector}>
        {tags.map((tag, index) => (
          <Button
            accessibilityLabel={`#${tag.name}`}
            aria-pressed={tag.id === selected.id}
            accessibilityState={{ selected: tag.id === selected.id }}
            key={tag.id}
            onPress={() => {
              const actionSequence = analytics.action('discovery', 'select_tag', index);
              if (tag.id !== selected.id) {
                setSelectedActionSequence(actionSequence);
              }
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
      <RelatedTag
        actionSequence={selectedActionSequence}
        analytics={analytics}
        hashtagId={selected.id}
        key={selectedIndex}
        tagName={selected.name}
        tagIndex={selectedIndex}
      />
    </View>
  );
}

function RelatedTag({
  actionSequence,
  analytics,
  hashtagId,
  tagName,
  tagIndex,
}: {
  actionSequence?: number;
  analytics: FirstProfileOnboardingAnalytics;
  hashtagId: string;
  tagName: string;
  tagIndex: number;
}) {
  const [token, setToken] = useState<FirstProfileOperationToken | null>(null);
  const hasResult = analytics.hasRelatedProfilesResult(tagIndex);
  useEffect(() => {
    if (hasResult) {
      return;
    }
    const nextToken = analytics.beginOperation(
      'discovery',
      'load_related_profiles',
      actionSequence,
      tagIndex,
    );
    setToken(nextToken);
    return () => analytics.finishOperation(nextToken, 'not_observed');
  }, [actionSequence, analytics, hasResult, tagIndex]);
  useEffect(
    () => () => {
      if (token) {
        analytics.finishOperation(token, 'not_observed');
      }
    },
    [analytics, token],
  );

  const retryWithToken = (retry: () => void) => {
    const retrySequence = analytics.action('discovery', 'retry', tagIndex);
    setToken(
      analytics.beginOperation('discovery', 'load_related_profiles', retrySequence, tagIndex),
    );
    retry();
  };
  if ((!token || token.tagIndex !== tagIndex) && !hasResult) {
    return <DiscoveryState loading title={`#${tagName} 관련 프로필을 불러오는 중이에요`} />;
  }

  return (
    <RouteBoundary
      key={tagIndex}
      error={(retry) => {
        if (token) {
          analytics.relatedProfilesFailed(token, 'network');
        }
        return (
          <DiscoveryState
            actionLabel="다시 시도"
            alert
            description="잠시 후 다시 시도해주세요."
            onAction={() => retryWithToken(retry)}
            title={`#${tagName} 관련 프로필을 불러오지 못했어요`}
          />
        );
      }}
      loading={<DiscoveryState loading title={`#${tagName} 관련 프로필을 불러오는 중이에요`} />}
      title={`#${tagName} 관련 프로필을 불러오지 못했어요`}
    >
      <TagQuery
        analytics={analytics}
        hashtagId={hashtagId}
        onRetry={retryWithToken}
        token={token}
        tagIndex={tagIndex}
      />
    </RouteBoundary>
  );
}

function TagQuery({
  analytics,
  hashtagId,
  onRetry,
  tagIndex,
  token,
}: {
  analytics: FirstProfileOnboardingAnalytics;
  hashtagId: string;
  onRetry: (retry: () => void) => void;
  tagIndex: number;
  token: FirstProfileOperationToken | null;
}) {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileTagDiscoveryTagQuery>(
    tagQuery,
    { hashtagId },
    { fetchKey, fetchPolicy },
  );
  if (data.node?.__typename !== 'Hashtag' || !data.node.relatedProfiles) {
    if (token) {
      analytics.relatedProfilesFailed(token, 'response');
    }
    return (
      <DiscoveryState
        actionLabel="다시 시도"
        alert
        onAction={() => onRetry(refetch)}
        title="이 태그의 관련 프로필을 확인할 수 없어요"
      />
    );
  }
  return (
    <RelatedProfiles
      analytics={analytics}
      hashtag={data.node.relatedProfiles}
      tagIndex={tagIndex}
      token={token}
    />
  );
}

function RelatedProfiles({
  analytics,
  hashtag,
  tagIndex,
  token,
}: {
  analytics: FirstProfileOnboardingAnalytics;
  hashtag: FirstProfileTagDiscoveryList_hashtag$key;
  tagIndex: number;
  token: FirstProfileOperationToken | null;
}) {
  const pagination = usePaginationFragment<
    FirstProfileTagDiscoveryNextPageQuery,
    FirstProfileTagDiscoveryList_hashtag$key
  >(listFragment, hashtag);
  const profiles = pagination.data.relatedProfiles.edges;
  const observedTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!token || observedTokenRef.current === token.id) {
      return;
    }
    observedTokenRef.current = token.id;
    analytics.relatedProfilesLoaded(token, Math.min(profiles.length, 20));
  }, [analytics, profiles.length, token]);

  const retryActionSequenceRef = useRef<number | undefined>(undefined);
  const pageTokenRef = useRef<FirstProfileOperationToken | null>(null);
  useEffect(
    () => () => {
      if (pageTokenRef.current) {
        analytics.finishOperation(pageTokenRef.current, 'not_observed');
      }
    },
    [analytics],
  );
  const loadNext: LoadNext = (count, options) => {
    const actionSequence = retryActionSequenceRef.current;
    retryActionSequenceRef.current = undefined;
    const operationToken = analytics.beginOperation(
      'discovery',
      'load_more_related_profiles',
      actionSequence,
      tagIndex,
    );
    pageTokenRef.current = operationToken;
    pagination.loadNext(count, {
      onComplete: (error) => {
        analytics.finishOperation(
          operationToken,
          error ? 'failed' : 'succeeded',
          error ? 'network' : undefined,
        );
        options.onComplete(error);
      },
    });
  };
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: profiles.length,
    loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });

  const retryLoadNextPage = () => {
    retryActionSequenceRef.current = analytics.action('discovery', 'retry', tagIndex);
    loadNextPage();
  };

  return (
    <ScrollView {...nativeScrollProps} contentContainerStyle={styles.list} style={styles.content}>
      {profiles.length ? (
        profiles.map((edge) => (
          <ProfileListItem
            key={edge.cursor}
            linked
            onboardingFollowAnalytics={analytics.follow}
            profile={edge.node}
            showBio
          />
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
        onRetry={retryLoadNextPage}
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
