import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { usePaginationScrollRegistration } from '@/components/pagination/PaginationScrollView';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { MutedProfileList } from '@/components/profile/MutedProfileList';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import type { SettingsMutedProfiles_profile$key } from './__generated__/SettingsMutedProfiles_profile.graphql';
import type { SettingsMutedProfilesNextPageQuery } from './__generated__/SettingsMutedProfilesNextPageQuery.graphql';
import type { SettingsMutedProfilesQuery } from './__generated__/SettingsMutedProfilesQuery.graphql';

const SettingsMutedProfilesQuery = graphql`
  query SettingsMutedProfilesQuery {
    currentSession {
      selectedProfile {
        id
        instance {
          kind
        }
        ...SettingsMutedProfiles_profile @arguments(count: 20)
      }
    }
  }
`;

const SettingsMutedProfilesFragment = graphql`
  fragment SettingsMutedProfiles_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "SettingsMutedProfilesNextPageQuery") {
    id
    profileMutes(first: $count, after: $cursor)
      @connection(key: "SettingsMutedProfiles_profileMutes") {
      edges {
        cursor
        node {
          id
          targetProfile {
            id
            displayName
            relativeHandle
            ...ProfileMuteAction_profile
            avatar {
              id
              url
            }
          }
        }
      }
    }
  }
`;

export function SettingsMutedProfiles() {
  return (
    <RouteBoundary
      error={(retry) => <MutedProfileList state={{ onRetry: retry, status: 'error' }} />}
      loading={<MutedProfileList state={{ status: 'loading' }} />}
      title="뮤트한 프로필을 불러오지 못했어요"
    >
      <SettingsMutedProfilesContent />
    </RouteBoundary>
  );
}

function SettingsMutedProfilesContent() {
  const shellChrome = useShellChrome();
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SettingsMutedProfilesQuery>(
    SettingsMutedProfilesQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile;
  const pagination = usePaginationFragment<
    SettingsMutedProfilesNextPageQuery,
    SettingsMutedProfiles_profile$key
  >(SettingsMutedProfilesFragment, profile ?? null);
  const edges = pagination.data?.profileMutes.edges ?? [];
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: edges.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    requestKey: profile?.id,
  });
  usePaginationScrollRegistration(nativeScrollProps);
  if (!profile || profile.instance.kind !== 'LOCAL') {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }

  const listState = {
    pagination: loadError
      ? { onRetry: loadNextPage, status: 'error' as const }
      : pagination.isLoadingNext
        ? { status: 'loading' as const }
        : pagination.hasNext
          ? { status: 'more' as const }
          : { status: 'end' as const },
    paginationEndRef: endRef,
    profiles: edges.map((edge) => ({
      action: <ProfileMuteAction profile={edge.node.targetProfile} surface="button" />,
      avatarUri: edge.node.targetProfile.avatar?.url,
      displayName: edge.node.targetProfile.displayName,
      id: edge.node.targetProfile.id,
      relativeHandle: edge.node.targetProfile.relativeHandle,
    })),
    status: 'loaded' as const,
  };

  return <MutedProfileList state={listState} />;
}
