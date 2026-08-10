import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { removeFollowRequestFromConnection } from './followRequestStore';
import type { Href } from 'expo-router';
import type { RecordSourceSelectorProxy } from 'relay-runtime';
import type { FollowRequestListItem_request$key } from './__generated__/FollowRequestListItem_request.graphql';
import type { FollowRequestListItemApproveMutation } from './__generated__/FollowRequestListItemApproveMutation.graphql';
import type { FollowRequestListItemRejectMutation } from './__generated__/FollowRequestListItemRejectMutation.graphql';

type FollowRequestAction = 'approve' | 'reject';

type FollowRequestListItemProps = {
  connectionId: string;
  request: FollowRequestListItem_request$key;
};

const followRequestListItemFragment = graphql`
  fragment FollowRequestListItem_request on ProfileFollowRequest {
    id
    follower {
      id
      avatar {
        id
        url
      }
      displayName
      handle
      relativeHandle
      ...ProfileNameBlock_profile
    }
  }
`;

const approveFollowRequestMutation = graphql`
  mutation FollowRequestListItemApproveMutation($id: ID!) {
    approveProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId
      followerProfile {
        id
        followingCount
      }
      followeeProfile {
        followersCount
        id
      }
      profileFollow {
        id
        follower {
          id
        }
        followee {
          id
        }
      }
    }
  }
`;

const rejectFollowRequestMutation = graphql`
  mutation FollowRequestListItemRejectMutation($id: ID!) {
    rejectProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId
      followeeProfile {
        id
      }
    }
  }
`;

function removeCompletedRequest(
  store: RecordSourceSelectorProxy,
  rootField: 'approveProfileFollowRequest' | 'rejectProfileFollowRequest',
  connectionId: string,
) {
  const requestId = store.getRootField(rootField)?.getValue('profileFollowRequestId');

  if (typeof requestId === 'string') {
    removeFollowRequestFromConnection(store, connectionId, requestId);
  }
}

export function FollowRequestListItem({ connectionId, request }: FollowRequestListItemProps) {
  const theme = useTheme();
  const data = useFragment(followRequestListItemFragment, request);
  const [commitApprove] = useMutation<FollowRequestListItemApproveMutation>(
    approveFollowRequestMutation,
  );
  const [commitReject] = useMutation<FollowRequestListItemRejectMutation>(
    rejectFollowRequestMutation,
  );
  const [pendingAction, setPendingAction] = useState<FollowRequestAction | null>(null);
  const [failedAction, setFailedAction] = useState<FollowRequestAction | null>(null);
  const follower = data.follower;
  const name = follower ? follower.displayName || follower.handle : '확인할 수 없는 프로필';
  const busy = pendingAction !== null;

  const handleFailure = (action: FollowRequestAction) => {
    setPendingAction(null);
    setFailedAction(action);
  };

  const commit = (action: FollowRequestAction) => {
    if (busy) {
      return;
    }

    setPendingAction(action);
    setFailedAction(null);
    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) => {
        if (errors?.length) {
          handleFailure(action);
          return;
        }
        setPendingAction(null);
        setFailedAction(null);
      },
      onError: () => handleFailure(action),
      variables: { id: data.id },
    };

    if (action === 'approve') {
      commitApprove({
        ...callbacks,
        updater: (store) =>
          removeCompletedRequest(store, 'approveProfileFollowRequest', connectionId),
      });
      return;
    }

    commitReject({
      ...callbacks,
      updater: (store) => removeCompletedRequest(store, 'rejectProfileFollowRequest', connectionId),
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        {follower ? (
          <NavigationLink href={`/${follower.relativeHandle}` as Href}>
            <Pressable
              accessibilityLabel={`${name} 프로필로 이동`}
              accessibilityRole="link"
              style={styles.profile}
            >
              <Avatar imageUri={follower.avatar?.url} label={name} size={40} />
              <ProfileNameBlock profile={follower} style={styles.copy} />
            </Pressable>
          </NavigationLink>
        ) : (
          <View style={styles.profile}>
            <Avatar label={name} size={40} />
            <Text numberOfLines={1} style={[styles.name, styles.copy, { color: theme.text }]}>
              {name}
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          {follower ? (
            <FollowRequestActionButton
              action="approve"
              busy={busy}
              failed={failedAction === 'approve'}
              name={name}
              onPress={() => commit('approve')}
              pending={pendingAction === 'approve'}
            />
          ) : null}
          <FollowRequestActionButton
            action="reject"
            busy={busy}
            failed={failedAction === 'reject'}
            name={name}
            onPress={() => commit('reject')}
            pending={pendingAction === 'reject'}
          />
        </View>
      </View>
      {failedAction ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.textSecondary }]}>
          팔로우 요청을 {failedAction === 'approve' ? '승인' : '거절'}하지 못했어요. 다시
          시도해주세요.
        </Text>
      ) : null}
    </View>
  );
}

function FollowRequestActionButton({
  action,
  busy,
  failed,
  name,
  onPress,
  pending,
}: {
  action: FollowRequestAction;
  busy: boolean;
  failed: boolean;
  name: string;
  onPress: () => void;
  pending: boolean;
}) {
  const label = action === 'approve' ? '승인' : '거절';
  const visibleLabel = failed ? `${label} 다시 시도` : label;

  return (
    <Button
      accessibilityLabel={`${name} 팔로우 요청 ${visibleLabel}`}
      accessibilityState={{ busy: pending, disabled: busy }}
      disabled={busy}
      loading={pending}
      loadingText="처리 중"
      onPress={onPress}
      style={styles.action}
      tone={action === 'approve' ? 'primary' : 'secondary'}
    >
      {visibleLabel}
    </Button>
  );
}

const actionMinHeight = Platform.select({ android: 48, ios: 44, default: 40 });

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  profile: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: actionMinHeight,
    minWidth: 0,
  },
  copy: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  actions: { flexDirection: 'row', flexShrink: 0, gap: spacing.sm },
  action: {
    minHeight: actionMinHeight,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
  },
  error: { fontFamily: 'SUIT', textAlign: 'right', ...typography.xsm },
});
