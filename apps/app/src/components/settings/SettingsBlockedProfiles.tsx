import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import type { FollowButton_profile$key } from '@/components/profile/__generated__/FollowButton_profile.graphql';
import type { FollowButton_profileBlock$key } from '@/components/profile/__generated__/FollowButton_profileBlock.graphql';
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

type FocusIntent = Readonly<{ index: number; profileBlockId: string }>;

let pendingFocusIntent: FocusIntent | null = null;
let activeFocusRestorer: (() => boolean) | null = null;

export function SettingsBlockedProfiles() {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  return (
    <RouteBoundary
      error={(retry) => <BlockedProfilesView state={{ onRetry: retry, status: 'error' }} />}
      key={actorLifecycleKey}
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
  >(SettingsBlockedProfilesFragment, profile ?? null);
  const [loadError, setLoadError] = useState(false);
  const edges = pagination.data?.profileBlocks.edges ?? [];
  const loadMore = useCallback(() => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }
    setLoadError(false);
    pagination.loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  }, [pagination.hasNext, pagination.isLoadingNext, pagination.loadNext]);

  if (!profile || profile.instance.kind !== 'LOCAL') {
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

export function BlockedProfilesView({ state }: { state: BlockedProfilesState }) {
  const theme = useTheme();
  const { showToast } = useToast();
  const mounted = useRef(true);
  const headingRef = useRef<View>(null);
  const actionRefs = useRef(new Map<string, View>());
  const removedFocus = useRef<{ index: number; profileBlockId: string } | null>(null);
  const stateRef = useRef(state);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  stateRef.current = state;
  const loadError =
    state.status === 'error'
      ? state
      : state.status === 'loaded' && state.pagination.status === 'error'
        ? state.pagination
        : null;
  const errorMessage = loadError
    ? state.status === 'error'
      ? '차단한 프로필을 불러오지 못했어요'
      : '프로필을 더 불러오지 못했어요'
    : null;
  const retryRef = useRef(loadError?.onRetry);
  useEffect(() => {
    retryRef.current = loadError?.onRetry;
  }, [loadError?.onRetry]);
  useEffect(() => {
    if (errorMessage) {
      return showToast(errorMessage, {
        action: {
          label: '다시 시도',
          onPress: () => {
            headingRef.current?.focus();
            retryRef.current?.();
          },
        },
        tone: 'danger',
      });
    }
  }, [errorMessage, showToast]);

  const restoreRemovedFocus = () => {
    const removed = removedFocus.current ?? pendingFocusIntent;
    const currentState = stateRef.current;
    if (
      !removed ||
      currentState.status !== 'loaded' ||
      currentState.profiles.some((profile) => profile.profileBlockId === removed.profileBlockId)
    ) {
      return false;
    }
    removedFocus.current = null;
    if (pendingFocusIntent?.profileBlockId === removed.profileBlockId) {
      pendingFocusIntent = null;
    }
    const next = currentState.profiles[Math.min(removed.index, currentState.profiles.length - 1)];
    if (next) {
      actionRefs.current.get(next.profileBlockId)?.focus();
    } else {
      headingRef.current?.focus();
    }
    return true;
  };
  const restoreRemovedFocusRef = useRef(restoreRemovedFocus);
  restoreRemovedFocusRef.current = restoreRemovedFocus;

  useEffect(() => {
    mounted.current = true;
    const restoreFocus = () => restoreRemovedFocusRef.current();
    activeFocusRestorer = restoreFocus;
    return () => {
      mounted.current = false;
      if (activeFocusRestorer === restoreFocus) {
        activeFocusRestorer = null;
      }
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      if (!mounted.current) {
        activeFocusRestorer?.();
        return;
      }
      restoreRemovedFocusRef.current();
    }, 0);
    return () => {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    };
  }, [state]);

  const rememberRemovedProfile = (profile: BlockedProfile) => {
    if (state.status !== 'loaded') {
      return;
    }
    const intent = {
      index: state.profiles.findIndex(
        (candidate) => candidate.profileBlockId === profile.profileBlockId,
      ),
      profileBlockId: profile.profileBlockId,
    };
    removedFocus.current = intent;
    pendingFocusIntent = intent;
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View accessible accessibilityRole="header" ref={headingRef} tabIndex={-1}>
        <Text
          style={[
            styles.heading,
            { color: theme.foregroundPrimary, borderColor: theme.borderDefault },
          ]}
        >
          차단한 프로필
        </Text>
      </View>
      <View accessibilityLabel="차단한 프로필 목록">
        {state.status === 'loading' ? (
          <StateView loading title="차단한 프로필을 불러오는 중입니다." />
        ) : state.status === 'error' ? (
          <StateView
            actionLabel="다시 시도"
            alert
            onAction={state.onRetry}
            title="차단한 프로필을 불러오지 못했어요"
          />
        ) : state.profiles.length === 0 && state.pagination.status === 'end' ? (
          <StateView title="차단한 프로필이 없어요" />
        ) : (
          <>
            {state.profiles.map((profile) => (
              <ProfileListItemContent
                avatarLabel={profile.displayName}
                displayName={profile.displayName}
                key={profile.profileBlockId}
                relativeHandle={profile.relativeHandle}
                style={styles.row}
              >
                <FollowButton
                  onActionRef={(node) => {
                    if (node) {
                      actionRefs.current.set(profile.profileBlockId, node);
                    } else {
                      actionRefs.current.delete(profile.profileBlockId);
                    }
                  }}
                  onUnblockSuccess={() => rememberRemovedProfile(profile)}
                  profile={profile.profile}
                  profileBlock={profile.profileBlock}
                  size="compact"
                />
              </ProfileListItemContent>
            ))}
            {state.pagination.status === 'error' ? (
              <StateView
                actionLabel="더 불러오기"
                alert
                onAction={state.pagination.onRetry}
                title="프로필을 더 불러오지 못했어요"
              />
            ) : state.pagination.status === 'loading' ? (
              <StateView loading title="프로필을 더 불러오는 중입니다." />
            ) : state.pagination.status === 'more' ? (
              <View style={styles.pagination}>
                <Button onPress={state.pagination.onLoadMore} tone="secondary">
                  더 불러오기
                </Button>
              </View>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  heading: { ...textStyles.uiHeadingM, borderBottomWidth: borderWidths[1], padding: space[16] },
  row: { height: 64, paddingVertical: 0 },
  pagination: { alignItems: 'center', padding: space[16] },
});
