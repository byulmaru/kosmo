import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { NotificationsApproveFollowRequestMutation } from './__generated__/NotificationsApproveFollowRequestMutation.graphql';
import type { NotificationsPageQuery } from './__generated__/NotificationsPageQuery.graphql';
import type { NotificationsRejectFollowRequestMutation } from './__generated__/NotificationsRejectFollowRequestMutation.graphql';

const NotificationsQuery = graphql`
  query NotificationsPageQuery {
    incomingFollowRequests(first: 50)
      @connection(key: "NotificationsIncomingFollowRequests_incomingFollowRequests") {
      edges {
        node {
          id
          follower {
            displayName
            handle
            relativeHandle
          }
        }
      }
    }
  }
`;

const approveFollowRequestMutation = graphql`
  mutation NotificationsApproveFollowRequestMutation($connections: [ID!]!, $id: ID!) {
    approveFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
      profileFollow {
        id
      }
    }
  }
`;

const rejectFollowRequestMutation = graphql`
  mutation NotificationsRejectFollowRequestMutation($connections: [ID!]!, $id: ID!) {
    rejectFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
    }
  }
`;

const incomingRequestsConnectionId = ConnectionHandler.getConnectionID(
  'client:root',
  'NotificationsIncomingFollowRequests_incomingFollowRequests',
);

export default function NotificationsScreen() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      loading={<StateView loading title="팔로우 요청을 불러오는 중입니다." />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="팔로우 요청을 불러오지 못했어요"
    >
      <NotificationsContent fetchKey={`${revision}:${fetchKey}`} />
    </RouteBoundary>
  );
}

function NotificationsContent({ fetchKey }: { fetchKey: string }) {
  const theme = useTheme();
  const data = useLazyLoadQuery<NotificationsPageQuery>(
    NotificationsQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const requests = (data.incomingFollowRequests?.edges ?? []).flatMap((edge) =>
    edge.node.follower ? [{ id: edge.node.id, follower: edge.node.follower }] : [],
  );

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>KOSMO</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          알림
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>팔로우 요청</Text>
      </View>
      {requests.length ? (
        <View style={[styles.list, { borderColor: theme.border }]}>
          {requests.map((request) => (
            <FollowRequestItem key={request.id} request={request} />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>대기 중인 요청이 없어요</Text>
          <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            새 팔로우 요청이 오면 여기에서 승인하거나 거절할 수 있어요.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

type FollowRequestItemProps = {
  request: {
    id: string;
    follower: { displayName: string; handle: string; relativeHandle: string };
  };
};

function FollowRequestItem({ request }: FollowRequestItemProps) {
  const theme = useTheme();
  const [commitApprove, approving] = useMutation<NotificationsApproveFollowRequestMutation>(
    approveFollowRequestMutation,
  );
  const [commitReject, rejecting] = useMutation<NotificationsRejectFollowRequestMutation>(
    rejectFollowRequestMutation,
  );
  const [error, setError] = useState(false);
  const loading = approving || rejecting;
  const callbacks = {
    onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
      setError(Boolean(errors?.length)),
    onError: () => setError(true),
  };
  const variables = { connections: [incomingRequestsConnectionId], id: request.id };

  return (
    <View style={[styles.item, { borderColor: theme.border }]}>
      <Avatar label={request.follower.displayName || request.follower.handle} size={40} />
      <View style={styles.profileCopy}>
        <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
          {request.follower.displayName}
        </Text>
        <Text numberOfLines={1} style={[styles.profileHandle, { color: theme.textSecondary }]}>
          {request.follower.relativeHandle}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          disabled={loading}
          onPress={() => {
            setError(false);
            commitApprove({ ...callbacks, variables });
          }}
          style={styles.action}
        >
          승인
        </Button>
        <Button
          disabled={loading}
          onPress={() => {
            setError(false);
            commitReject({ ...callbacks, variables });
          }}
          style={styles.action}
          tone="secondary"
        >
          거절
        </Button>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          요청을 처리하지 못했습니다.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  heading: { gap: spacing.sm },
  eyebrow: { fontFamily: 'SUIT', fontWeight: '700', letterSpacing: 1.6, ...typography.xsm },
  title: { fontFamily: 'SUIT', fontSize: 48, fontWeight: '700', lineHeight: 52 },
  description: { fontFamily: 'SUIT', ...typography.md },
  list: { borderTopWidth: 1 },
  item: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: 72,
    paddingVertical: spacing.md,
  },
  profileCopy: { flex: 1, minWidth: 120 },
  profileName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  profileHandle: { fontFamily: 'SUIT', ...typography.xsm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { minHeight: 36, minWidth: 72, paddingHorizontal: spacing.md },
  error: { flexBasis: '100%', fontFamily: 'SUIT', ...typography.xsm },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  emptyDescription: {
    fontFamily: 'SUIT',
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
});
