import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { BlockedProfileList } from '@/components/profile/BlockedProfileList';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { FollowButton_profile$key } from '@/components/profile/__generated__/FollowButton_profile.graphql';
import type { FollowButton_profileBlock$key } from '@/components/profile/__generated__/FollowButton_profileBlock.graphql';
import type { SettingsBlockedProfiles_profile$key } from './__generated__/SettingsBlockedProfiles_profile.graphql';
import type { SettingsBlockedProfilesNextPageQuery } from './__generated__/SettingsBlockedProfilesNextPageQuery.graphql';
import type { SettingsBlockedProfilesQuery } from './__generated__/SettingsBlockedProfilesQuery.graphql';

const SettingsBlockedProfilesQuery = graphql`
  query SettingsBlockedProfilesQuery($withProfileBlocks: Boolean!) {
    currentSession {
      selectedProfile {
        id
        instance {
          kind
        }
        ...SettingsBlockedProfiles_profile
          @arguments(count: 20)
          @alias(as: "profileBlocksFragment")
          @include(if: $withProfileBlocks)
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
          ...FollowButton_profileBlock
          targetProfile {
            displayName
            relativeHandle
            ...FollowButton_profile
          }
        }
      }
    }
  }
`;

type BlockedProfile = Readonly<{
  displayName: string;
  profile: FollowButton_profile$key;
  profileBlock: FollowButton_profileBlock$key;
  profileBlockId: string;
  relativeHandle: string;
}>;
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more'; onLoadMore: () => void }
  | { status: 'error'; onRetry: () => void };
type BlockedProfilesState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'loaded'; profiles: readonly BlockedProfile[]; pagination: Pagination };

type FocusIntent = Readonly<{ ownerProfileId: string; profileBlockId: string }>;

let pendingFocusIntent: FocusIntent | null = null;

export function SettingsBlockedProfiles({ headingRef }: { headingRef?: RefObject<View | null> }) {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  return (
    <RouteBoundary
      error={(retry) => (
        <BlockedProfilesView headingRef={headingRef} state={{ onRetry: retry, status: 'error' }} />
      )}
      key={actorLifecycleKey}
      loading={<BlockedProfilesView headingRef={headingRef} state={{ status: 'loading' }} />}
      title="차단한 프로필을 불러오지 못했어요"
    >
      <SettingsBlockedProfilesContent headingRef={headingRef} />
    </RouteBoundary>
  );
}

function SettingsBlockedProfilesContent({ headingRef }: { headingRef?: RefObject<View | null> }) {
  const shellChrome = useShellChrome();
  const { selectedProfileKind } = useSession();
  const withProfileBlocks = selectedProfileKind === 'LOCAL';
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SettingsBlockedProfilesQuery>(
    SettingsBlockedProfilesQuery,
    { withProfileBlocks },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile;
  const pagination = usePaginationFragment<
    SettingsBlockedProfilesNextPageQuery,
    SettingsBlockedProfiles_profile$key
  >(
    SettingsBlockedProfilesFragment,
    withProfileBlocks ? (profile?.profileBlocksFragment ?? null) : null,
  );
  const [loadError, setLoadError] = useState(false);
  const edges = pagination.data?.profileBlocks.edges ?? [];
  const loadMore = useCallback(() => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }
    setLoadError(false);
    pagination.loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  }, [pagination.hasNext, pagination.isLoadingNext, pagination.loadNext]);

  if (!withProfileBlocks || !profile || profile.instance.kind !== 'LOCAL') {
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
      headingRef={headingRef}
      ownerProfileId={profile.id}
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
          profile: edge.node.targetProfile,
          profileBlock: edge.node,
          profileBlockId: edge.node.id,
          relativeHandle: edge.node.targetProfile.relativeHandle,
        })),
        status: 'loaded',
      }}
    />
  );
}

export function BlockedProfilesView({
  headingRef,
  ownerProfileId,
  state,
}: {
  headingRef?: RefObject<View | null>;
  ownerProfileId?: string;
  state: BlockedProfilesState;
}) {
  const removedFocus = useRef<{ profileBlockId: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const pending =
        pendingFocusIntent?.ownerProfileId === ownerProfileId ? pendingFocusIntent : null;
      const removed = removedFocus.current ?? pending;
      if (
        !removed ||
        state.status !== 'loaded' ||
        state.profiles.some((profile) => profile.profileBlockId === removed.profileBlockId)
      ) {
        return;
      }
      removedFocus.current = null;
      if (pending?.profileBlockId === removed.profileBlockId) {
        pendingFocusIntent = null;
      }
      headingRef?.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [headingRef, ownerProfileId, state]);

  const rememberRemovedProfile = (profile: BlockedProfile) => {
    if (state.status !== 'loaded') {
      return;
    }
    const intent = { profileBlockId: profile.profileBlockId };
    removedFocus.current = intent;
    if (ownerProfileId) {
      pendingFocusIntent = { ...intent, ownerProfileId };
    }
  };

  const children =
    state.status === 'loaded'
      ? state.profiles.map((profile) => (
          <ProfileListItemContent
            avatarLabel={profile.displayName}
            displayName={profile.displayName}
            key={profile.profileBlockId}
            relativeHandle={profile.relativeHandle}
            style={styles.row}
          >
            <FollowButton
              onUnblockSuccess={() => rememberRemovedProfile(profile)}
              profile={profile.profile}
              profileBlock={profile.profileBlock}
              size="compact"
            />
          </ProfileListItemContent>
        ))
      : null;
  const listState =
    state.status === 'loading'
      ? ({ status: 'loading' } as const)
      : state.status === 'error'
        ? state
        : state.profiles.length === 0 && state.pagination.status === 'end'
          ? ({ status: 'empty' } as const)
          : ({ children, pagination: state.pagination, status: 'loaded' } as const);

  return <BlockedProfileList headingRef={headingRef} state={listState} />;
}

const styles = StyleSheet.create({
  row: { height: 64, paddingVertical: 0 },
});
