import { useCallback, useMemo, useState } from 'react';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
import { useProfileBlockMutations } from '@/components/profile/ProfileBlockController';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import type { SettingsBlockedProfiles_profile$key } from './__generated__/SettingsBlockedProfiles_profile.graphql';
import type { SettingsBlockedProfilesNextPageQuery } from './__generated__/SettingsBlockedProfilesNextPageQuery.graphql';
import type { SettingsBlockedProfilesQuery } from './__generated__/SettingsBlockedProfilesQuery.graphql';

const SettingsBlockedProfilesQuery = graphql`
  query SettingsBlockedProfilesQuery {
    currentSession {
      selectedProfile {
        id
        instance {
          kind
        }
        ...SettingsBlockedProfiles_profile @arguments(count: 20)
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
          id
          targetProfile {
            id
            displayName
            handle
            domain
            instanceKind
          }
        }
      }
    }
  }
`;

export function SettingsBlockedProfiles() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const identity = `${revision}:${fetchKey}`;

  return (
    <RouteBoundary
      error={(retry) => (
        <BlockedProfileList
          onUnblock={() => Promise.reject(new Error('retry'))}
          state={{ onRetry: retry, status: 'error' }}
        />
      )}
      key={identity}
      loading={
        <BlockedProfileList onUnblock={() => Promise.resolve()} state={{ status: 'loading' }} />
      }
      onRetry={() => setFetchKey((current) => current + 1)}
      title="차단한 프로필을 불러오지 못했어요"
    >
      <SettingsBlockedProfilesContent fetchKey={identity} />
    </RouteBoundary>
  );
}

function SettingsBlockedProfilesContent({ fetchKey }: { fetchKey: string }) {
  const { selectedProfileId } = useSession();
  const data = useLazyLoadQuery<SettingsBlockedProfilesQuery>(
    SettingsBlockedProfilesQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile;
  const pagination = usePaginationFragment<
    SettingsBlockedProfilesNextPageQuery,
    SettingsBlockedProfiles_profile$key
  >(SettingsBlockedProfilesFragment, profile ?? null);
  const { changeBlocked } = useProfileBlockMutations();
  const [loadError, setLoadError] = useState(false);
  const edges = pagination.data?.profileBlocks.edges ?? [];
  const relationsByTarget = useMemo(
    () => new Map(edges.map((edge) => [edge.node.targetProfile.id, edge.node.id])),
    [edges],
  );

  const onUnblock = useCallback(
    (targetProfileId: string) => {
      const profileBlockId = relationsByTarget.get(targetProfileId);
      if (
        !profile?.id ||
        !selectedProfileId ||
        selectedProfileId !== profile.id ||
        !profileBlockId
      ) {
        return Promise.reject(new Error('Profile block request is no longer available.'));
      }
      return changeBlocked({ ownerProfileId: profile.id, profileBlockId }, false);
    },
    [changeBlocked, profile?.id, relationsByTarget, selectedProfileId],
  );

  const loadMore = useCallback(() => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }
    setLoadError(false);
    pagination.loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  }, [pagination.hasNext, pagination.isLoadingNext, pagination.loadNext]);

  if (!profile || profile.instance.kind !== 'LOCAL') {
    return (
      <BlockedProfileList
        onUnblock={() => Promise.resolve()}
        state={{ pagination: { status: 'end' }, profiles: [], status: 'loaded' }}
      />
    );
  }

  return (
    <BlockedProfileList
      onUnblock={onUnblock}
      state={{
        pagination: loadError
          ? { onRetry: loadMore, status: 'error' }
          : pagination.isLoadingNext
            ? { status: 'loading' }
            : pagination.hasNext
              ? { onLoadMore: loadMore, status: 'more' }
              : { status: 'end' },
        profiles: edges.map((edge) => ({
          displayName: edge.node.targetProfile.displayName,
          id: edge.node.targetProfile.id,
        })),
        status: 'loaded',
      }}
    />
  );
}
