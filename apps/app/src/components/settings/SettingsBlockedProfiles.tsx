import { StyleSheet, Text } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { usePaginationScrollRegistration } from '@/components/pagination/PaginationScrollView';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';
import type { SettingsBlockedProfileRow_profileBlock$key } from './__generated__/SettingsBlockedProfileRow_profileBlock.graphql';
import type { SettingsBlockedProfiles_profile$key } from './__generated__/SettingsBlockedProfiles_profile.graphql';
import type { SettingsBlockedProfilesNextPageQuery } from './__generated__/SettingsBlockedProfilesNextPageQuery.graphql';
import type { SettingsBlockedProfilesQuery } from './__generated__/SettingsBlockedProfilesQuery.graphql';

const SettingsBlockedProfilesQuery = graphql`
  query SettingsBlockedProfilesQuery {
    currentSession {
      selectedProfile {
        id
        ...SettingsBlockedProfiles_profile @arguments(count: 20) @alias(as: "profileBlocksFragment")
      }
    }
  }
`;

const SettingsBlockedProfilesFragment = graphql`
  fragment SettingsBlockedProfiles_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "SettingsBlockedProfilesNextPageQuery") {
    id
    profileBlocks(first: $count, after: $cursor)
      @connection(key: "SettingsBlockedProfiles_profileBlocks") {
      edges {
        cursor
        node {
          ...SettingsBlockedProfileRow_profileBlock
        }
      }
    }
  }
`;

const SettingsBlockedProfileRowFragment = graphql`
  fragment SettingsBlockedProfileRow_profileBlock on ProfileBlock {
    ...ProfileBlockAction_profileBlock
    targetProfile {
      avatar {
        id
        url
      }
      displayName
      ...ProfileBlockAction_profile
      viewerState {
        profileBlock {
          ...ProfileBlockAction_profileBlock
        }
      }
    }
  }
`;

type BlockedProfile = Readonly<{
  key: string;
  profileBlock: SettingsBlockedProfileRow_profileBlock$key;
}>;
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more' }
  | { status: 'error'; onRetry: () => void };
type BlockedProfilesState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | {
      status: 'loaded';
      profiles: readonly BlockedProfile[];
      pagination: Pagination;
      paginationEndRef?: ReturnType<typeof useAutomaticPagination>['endRef'];
    };

export function SettingsBlockedProfiles() {
  return (
    <RouteBoundary
      error={(retry) => <BlockedProfilesView state={{ onRetry: retry, status: 'error' }} />}
      loading={<BlockedProfilesView state={{ status: 'loading' }} />}
      title="차단한 프로필을 불러오지 못했어요"
    >
      <SettingsBlockedProfilesContent />
    </RouteBoundary>
  );
}

function SettingsBlockedProfilesContent() {
  const shellChrome = useShellChrome();
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SettingsBlockedProfilesQuery>(
    SettingsBlockedProfilesQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile;
  const pagination = usePaginationFragment<
    SettingsBlockedProfilesNextPageQuery,
    SettingsBlockedProfiles_profile$key
  >(SettingsBlockedProfilesFragment, profile?.profileBlocksFragment ?? null);
  const edges = pagination.data?.profileBlocks?.edges ?? [];
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: edges.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    requestKey: profile?.id,
  });
  usePaginationScrollRegistration(nativeScrollProps);

  if (!profile || !pagination.data?.profileBlocks) {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }
  return (
    <BlockedProfilesView
      state={{
        pagination: loadError
          ? { onRetry: loadNextPage, status: 'error' }
          : pagination.isLoadingNext
            ? { status: 'loading' }
            : pagination.hasNext
              ? { status: 'more' }
              : { status: 'end' },
        paginationEndRef: endRef,
        profiles: edges.map((edge) => ({
          key: edge.cursor,
          profileBlock: edge.node,
        })),
        status: 'loaded',
      }}
    />
  );
}

export function BlockedProfilesView({ state }: { state: BlockedProfilesState }) {
  const children =
    state.status === 'loaded'
      ? state.profiles.map((profile) => (
          <SettingsBlockedProfileRow key={profile.key} profileBlock={profile.profileBlock} />
        ))
      : null;
  const listState =
    state.status === 'loading'
      ? ({ status: 'loading' } as const)
      : state.status === 'error'
        ? state
        : state.profiles.length === 0 && state.pagination.status === 'end'
          ? ({ status: 'empty' } as const)
          : ({
              children,
              pagination: state.pagination,
              paginationEndRef: state.paginationEndRef,
              status: 'loaded',
            } as const);

  return <BlockedProfileList state={listState} />;
}

function SettingsBlockedProfileRow({
  profileBlock,
}: {
  profileBlock: SettingsBlockedProfileRow_profileBlock$key;
}) {
  const data = useFragment(SettingsBlockedProfileRowFragment, profileBlock);
  const targetProfile = data.targetProfile;
  const currentProfileBlock = targetProfile.viewerState?.profileBlock ?? null;
  const theme = useTheme();

  return (
    <ProfileListItemContent
      avatarLabel={targetProfile.displayName}
      avatarUri={targetProfile.avatar?.url}
      displayName={targetProfile.displayName}
      identity={
        <Text numberOfLines={1} style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
          {targetProfile.displayName}
        </Text>
      }
      style={styles.row}
    >
      <ProfileBlockAction
        {...(currentProfileBlock
          ? { nextBlocked: false as const, profileBlock: currentProfileBlock }
          : { nextBlocked: true as const, profile: targetProfile })}
        surface="button"
      />
    </ProfileListItemContent>
  );
}

const styles = StyleSheet.create({
  row: { height: 64, paddingVertical: 0 },
});
