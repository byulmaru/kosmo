import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { useProfileBlockMutations } from '@/components/profile/ProfileBlockController';
import { StaleProfileBlockRequestError } from '@/components/profile/profileBlockErrors';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
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
            displayName
          }
        }
      }
    }
  }
`;

type BlockedProfile = Readonly<{ displayName: string; profileBlockId: string }>;
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more'; onLoadMore: () => void }
  | { status: 'error'; onRetry: () => void };
type BlockedProfilesState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'loaded'; profiles: readonly BlockedProfile[]; pagination: Pagination };

export function SettingsBlockedProfiles() {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  return (
    <RouteBoundary
      error={(retry) => (
        <BlockedProfilesView
          onUnblock={() => Promise.reject(new Error('retry'))}
          state={{ onRetry: retry, status: 'error' }}
        />
      )}
      key={actorLifecycleKey}
      loading={
        <BlockedProfilesView onUnblock={() => Promise.resolve()} state={{ status: 'loading' }} />
      }
      title="차단한 프로필을 불러오지 못했어요"
    >
      <SettingsBlockedProfilesContent />
    </RouteBoundary>
  );
}

function SettingsBlockedProfilesContent() {
  const { fetchKey } = useRouteBoundary();
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
  const onUnblock = useCallback(
    (profileBlockId: string) => {
      if (!profile?.id || !selectedProfileId || selectedProfileId !== profile.id) {
        return Promise.reject(new Error('Profile block request is no longer available.'));
      }
      return changeBlocked({ ownerProfileId: profile.id, profileBlockId }, false);
    },
    [changeBlocked, profile?.id, selectedProfileId],
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
      <BlockedProfilesView
        onUnblock={() => Promise.resolve()}
        state={{ pagination: { status: 'end' }, profiles: [], status: 'loaded' }}
      />
    );
  }
  return (
    <BlockedProfilesView
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
          profileBlockId: edge.node.id,
        })),
        status: 'loaded',
      }}
    />
  );
}

export function BlockedProfilesView({
  onUnblock,
  state,
}: {
  onUnblock: (profileBlockId: string) => Promise<void>;
  state: BlockedProfilesState;
}) {
  const theme = useTheme();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<BlockedProfile | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const cancelRef = useRef<View>(null);
  const headingRef = useRef<View>(null);
  const actionRefs = useRef(new Map<string, View>());
  const removedFocus = useRef<{ index: number; profileBlockId: string } | null>(null);
  const selectedForFocus = useRef<BlockedProfile | null>(null);
  const stateRef = useRef(state);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  stateRef.current = state;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    };
  }, []);
  const restoreRemovedFocus = () => {
    const removed = removedFocus.current;
    const currentState = stateRef.current;
    if (
      !removed ||
      currentState.status !== 'loaded' ||
      currentState.profiles.some((profile) => profile.profileBlockId === removed.profileBlockId)
    ) {
      return false;
    }
    removedFocus.current = null;
    const next = currentState.profiles[Math.min(removed.index, currentState.profiles.length - 1)];
    if (next) {
      actionRefs.current.get(next.profileBlockId)?.focus();
    } else {
      headingRef.current?.focus();
    }
    return true;
  };

  const close = () => {
    if (!inFlight.current) {
      setSelected(null);
    }
  };
  const requestUnblock = async () => {
    if (!selected || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    if (state.status === 'loaded') {
      removedFocus.current = {
        index: state.profiles.findIndex(
          (profile) => profile.profileBlockId === selected.profileBlockId,
        ),
        profileBlockId: selected.profileBlockId,
      };
    }
    try {
      await onUnblock(selected.profileBlockId);
      if (!mounted.current) {
        return;
      }
      setSelected(null);
      showToast('차단을 해제했어요', { tone: 'success' });
    } catch (error) {
      removedFocus.current = null;
      if (!mounted.current || error instanceof StaleProfileBlockRequestError) {
        return;
      }
      showToast('차단을 해제하지 못했어요. 다시 시도해 주세요.', { tone: 'danger' });
    } finally {
      if (mounted.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View accessibilityRole="header" ref={headingRef} tabIndex={-1}>
        <Text
          style={[
            styles.heading,
            { borderColor: theme.borderDefault, color: theme.foregroundPrimary },
          ]}
        >
          차단한 프로필
        </Text>
      </View>
      {state.status === 'loading' ? (
        <StateView loading title="차단한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <View style={styles.pagination}>
          <Button onPress={state.onRetry} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : state.profiles.length === 0 && state.pagination.status === 'end' ? (
        <StateView title="차단한 프로필이 없어요" />
      ) : (
        <>
          {state.profiles.map((profile) => (
            <ProfileListItemContent
              avatarLabel={profile.displayName}
              displayName={profile.displayName}
              key={profile.profileBlockId}
              style={styles.row}
            >
              <Button
                accessibilityLabel={`${profile.displayName} 차단 해제`}
                controlRef={(node) => {
                  if (node) {
                    actionRefs.current.set(profile.profileBlockId, node);
                  } else {
                    actionRefs.current.delete(profile.profileBlockId);
                  }
                }}
                onPress={() => {
                  selectedForFocus.current = profile;
                  setSelected(profile);
                }}
                size="compact"
                tone="secondary"
              >
                차단 해제
              </Button>
            </ProfileListItemContent>
          ))}
          {state.pagination.status === 'error' ? (
            <View style={styles.pagination}>
              <Button onPress={state.pagination.onRetry} tone="secondary">
                더 불러오기
              </Button>
            </View>
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
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() => {
          const previous = selectedForFocus.current;
          selectedForFocus.current = null;
          focusTimer.current = setTimeout(() => {
            focusTimer.current = null;
            if (!mounted.current || restoreRemovedFocus()) {
              return;
            }
            if (previous) {
              actionRefs.current.get(previous.profileBlockId)?.focus();
            }
          }, 0);
        }}
        onShow={() => cancelRef.current?.focus()}
        title="이 프로필의 차단을 해제할까요?"
        visible={selected !== null}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel="차단 해제"
          message="차단을 해제해도 이전 팔로우 관계는 복구되지 않아요."
          onCancel={close}
          onConfirm={() => void requestUnblock()}
          pending={pending}
          tone="danger"
        />
      </ModalSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  heading: { ...textStyles.uiHeadingM, borderBottomWidth: borderWidths[1], padding: space[16] },
  row: { height: 64, paddingVertical: 0 },
  pagination: { alignItems: 'center', padding: space[16] },
});
