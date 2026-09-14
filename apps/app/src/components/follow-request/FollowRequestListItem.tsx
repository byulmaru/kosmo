import { CheckIcon, XIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { getIconButtonTargetSize, IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, space } from '@/theme/tokens';
import type { Href } from 'expo-router';
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
  mutation FollowRequestListItemApproveMutation($connections: [ID!]!, $id: ID!) {
    approveProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
      profileFollowRequestId @deleteRecord
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
  mutation FollowRequestListItemRejectMutation($connections: [ID!]!, $id: ID!) {
    rejectProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
      profileFollowRequestId @deleteRecord
      followeeProfile {
        id
      }
    }
  }
`;

export function FollowRequestListItem({ connectionId, request }: FollowRequestListItemProps) {
  const { showToast } = useToast();
  const data = useFragment(followRequestListItemFragment, request);
  const [commitApprove] = useMutation<FollowRequestListItemApproveMutation>(
    approveFollowRequestMutation,
  );
  const [commitReject] = useMutation<FollowRequestListItemRejectMutation>(
    rejectFollowRequestMutation,
  );
  const [pendingAction, setPendingAction] = useState<FollowRequestAction | null>(null);
  const follower = data.follower;
  const name = follower ? follower.displayName || follower.handle : '확인할 수 없는 프로필';
  const busy = pendingAction !== null;

  const handleFailure = (action: FollowRequestAction) => {
    setPendingAction(null);
    showToast(
      `팔로우 요청을 ${action === 'approve' ? '승인' : '거절'}하지 못했어요. 다시 시도해주세요.`,
      { tone: 'danger' },
    );
  };

  const commit = (action: FollowRequestAction) => {
    if (busy) {
      return;
    }

    setPendingAction(action);
    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) => {
        if (errors?.length) {
          handleFailure(action);
          return;
        }
        setPendingAction(null);
      },
      onError: () => handleFailure(action),
    };

    if (action === 'approve') {
      commitApprove({
        ...callbacks,
        variables: { connections: [connectionId], id: data.id },
      });
      return;
    }

    commitReject({
      ...callbacks,
      variables: { connections: [connectionId], id: data.id },
    });
  };

  return (
    <ProfileListItemContent
      avatarLabel={name}
      avatarUri={follower?.avatar?.url}
      displayName={name}
      href={follower ? (`/${follower.relativeHandle}` as Href) : undefined}
      identity={
        follower ? (
          <ProfileNameBlock profile={follower} style={{ flex: 0 }} variant="compact" />
        ) : undefined
      }
      linkAccessibilityLabel={follower ? `${name} 프로필로 이동` : undefined}
    >
      <View style={styles.actions}>
        {follower ? (
          <FollowRequestActionButton
            action="approve"
            busy={busy}
            name={name}
            onPress={() => commit('approve')}
            pending={pendingAction === 'approve'}
          />
        ) : null}
        <FollowRequestActionButton
          action="reject"
          busy={busy}
          name={name}
          onPress={() => commit('reject')}
          pending={pendingAction === 'reject'}
        />
      </View>
    </ProfileListItemContent>
  );
}

function FollowRequestActionButton({
  action,
  busy,
  name,
  onPress,
  pending,
}: {
  action: FollowRequestAction;
  busy: boolean;
  name: string;
  onPress: () => void;
  pending: boolean;
}) {
  const theme = useTheme();
  const label = action === 'approve' ? '승인' : '거절';
  const iconColor = busy ? theme.stateDisabledForeground : theme.foregroundPrimary;
  const targetSize = getIconButtonTargetSize(Platform.OS);

  return (
    <IconButton
      accessibilityLabel={`${name} 팔로우 요청 ${label}`}
      accessibilityState={{ busy: pending, disabled: busy }}
      disabled={busy}
      feedback="opacity"
      onPress={onPress}
      targetSize={targetSize}
    >
      {pending ? (
        <ActivityIndicator
          accessibilityLabel={`${name} 팔로우 요청 ${label} 처리 중`}
          color={theme.foregroundPrimary}
          size="small"
          style={styles.spinner}
        />
      ) : action === 'approve' ? (
        <CheckIcon color={iconColor} size={iconSizes[20]} />
      ) : (
        <XIcon color={iconColor} size={iconSizes[20]} />
      )}
    </IconButton>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexShrink: 0, gap: space[8] },
  spinner: { height: iconSizes[16], width: iconSizes[16] },
});
