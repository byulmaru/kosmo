import { useCallback, useState } from 'react';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { MutedProfileList } from '@/components/profile/MutedProfileList';
import { useProfileMuteMutations } from '@/components/profile/ProfileMuteController';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
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

const noopUnmute = () => Promise.resolve();

export function SettingsMutedProfiles() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const identity = `${revision}:${fetchKey}`;

  return (
    <RouteBoundary
      error={(retry) => (
        <MutedProfileList
          onUnmute={noopUnmute}
          state={{ onRetry: retry, status: 'error' }}
        />
      )}
      key={identity}
      loading={<MutedProfileList onUnmute={noopUnmute} state={{ status: 'loading' }} />}
      onRetry={() => setFetchKey((current) => current + 1)}
      title="뮤트한 프로필을 불러오지 못했어요"
    >
      <SettingsMutedProfilesContent fetchKey={identity} />
    </RouteBoundary>
  );
}

function SettingsMutedProfilesContent({ fetchKey }: { fetchKey: string }) {
  const shellChrome = useShellChrome();
  const { changeMuted } = useProfileMuteMutations();
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
  const [loadError, setLoadError] = useState(false);
  const loadMore = useCallback(() => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }
    setLoadError(false);
    pagination.loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  }, [pagination.hasNext, pagination.isLoadingNext, pagination.loadNext]);
  const onUnmute = useCallback(
    (targetProfileId: string) => {
      const profileMuteId = edges.find((edge) => edge.node.targetProfile.id === targetProfileId)
        ?.node.id;
      if (!profileMuteId || !profile?.id) {
        return Promise.reject(new Error('Profile mute relation is no longer available.'));
      }
      return changeMuted(
        {
          ownerProfileId: profile.id,
          profileMuteId,
          targetProfileId,
        },
        false,
      );
    },
    [changeMuted, edges, profile?.id],
  );

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
      ? { onRetry: loadMore, status: 'error' as const }
      : pagination.isLoadingNext
        ? { status: 'loading' as const }
        : pagination.hasNext
          ? { onLoadMore: loadMore, status: 'more' as const }
          : { status: 'end' as const },
    profiles: edges.map((edge) => ({
      avatarUri: edge.node.targetProfile.avatar?.url,
      displayName: edge.node.targetProfile.displayName,
      id: edge.node.targetProfile.id,
      relativeHandle: edge.node.targetProfile.relativeHandle,
    })),
    status: 'loaded' as const,
  };

  return <MutedProfileList onUnmute={onUnmute} state={listState} />;
}
