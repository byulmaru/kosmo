import { CheckIcon, XIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { ProfileListItemContent } from '@/components/profile/ProfileListItemContent';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { getIconButtonTargetSize, IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
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

export function FollowRequestListItem({ connectionId, request }: FollowRequestListItemProps) {
  const { showToast } = useToast();
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
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

  const handleCompleted = (requestId: string) => {
    environment.commitUpdate((store) => {
      const connection = store.get(connectionId);
      if (connection) {
        ConnectionHandler.deleteNode(connection, requestId);
      }
      store.delete(requestId);
    });
    setPendingAction(null);
  };

  const commit = (action: FollowRequestAction) => {
    if (busy) {
      return;
    }

    setPendingAction(action);
    const mutationGeneration = environmentGenerationRef?.current;

    if (action === 'approve') {
      commitApprove({
        onCompleted: (response, errors) => {
          if (environmentGenerationRef?.current !== mutationGeneration) {
            return;
          }
          if (errors?.length) {
            handleFailure(action);
            return;
          }
          handleCompleted(response.approveProfileFollowRequest.profileFollowRequestId);
        },
        onError: () => {
          if (environmentGenerationRef?.current !== mutationGeneration) {
            return;
          }
          handleFailure(action);
        },
        variables: { id: data.id },
      });
      return;
    }

    commitReject({
      onCompleted: (response, errors) => {
        if (environmentGenerationRef?.current !== mutationGeneration) {
          return;
        }
        if (errors?.length) {
          handleFailure(action);
          return;
        }
        handleCompleted(response.rejectProfileFollowRequest.profileFollowRequestId);
      },
      onError: () => {
        if (environmentGenerationRef?.current !== mutationGeneration) {
          return;
        }
        handleFailure(action);
      },
      variables: { id: data.id },
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
