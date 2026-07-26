import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import { ReactionProfileConnection } from './ReactionProfileConnection';
import { ReactionProfileList } from './ReactionProfileList';
import type { ReactionProfilesModalQuery } from './__generated__/ReactionProfilesModalQuery.graphql';

const reactionProfilesModalQuery = graphql`
  query ReactionProfilesModalQuery($postId: ID!, $reactionType: String!) {
    node(id: $postId) {
      __typename
      ... on Post {
        ...ReactionProfileConnection_post
          @arguments(reactionType: $reactionType)
          @alias(as: "reactionProfileConnection")
      }
    }
  }
`;

type ReactionProfilesModalProps = {
  onClose: () => void;
  postId: string;
  reactionType: string;
};

function ReactionProfilesContent({
  fetchKey,
  postId,
  reactionType,
}: {
  fetchKey: number;
  postId: string;
  reactionType: string;
}) {
  const data = useLazyLoadQuery<ReactionProfilesModalQuery>(
    reactionProfilesModalQuery,
    { postId, reactionType },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.node?.__typename === 'Post' && data.node.reactionProfileConnection ? (
    <ReactionProfileConnection
      post={data.node.reactionProfileConnection}
      reactionType={reactionType}
    />
  ) : (
    <StateView title="게시글을 찾을 수 없어요" />
  );
}

export function ReactionProfilesModal({
  onClose,
  postId,
  reactionType,
}: ReactionProfilesModalProps) {
  const [fetchKey, setFetchKey] = useState(0);
  const theme = useTheme();
  const title = `${reactionType} 반응한 프로필`;

  return (
    <Modal
      accessibilityLabel={title}
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible
    >
      <Pressable accessibilityLabel={`${title} 닫기`} onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityLabel={title}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          role="dialog"
          style={[styles.surface, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <RouteBoundary
              loading={<ReactionProfileList loading reactionType={reactionType} />}
              onRetry={() => setFetchKey((key) => key + 1)}
              title="반응한 프로필을 불러오지 못했어요"
            >
              <ReactionProfilesContent
                fetchKey={fetchKey}
                postId={postId}
                reactionType={reactionType}
              />
            </RouteBoundary>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '80%',
    maxWidth: 420,
    width: '100%',
  },
  content: { padding: spacing.lg },
});
