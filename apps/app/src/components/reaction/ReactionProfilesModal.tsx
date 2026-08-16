import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
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
  reactionCounts: ReadonlyArray<Readonly<{ count: number; type: string }>>;
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
  reactionCounts,
}: ReactionProfilesModalProps) {
  const [fetchKey, setFetchKey] = useState(0);
  const [reactionType, setReactionType] = useState(reactionCounts[0]?.type ?? '');
  const theme = useTheme();
  const title = '반응한 프로필';

  useEffect(() => {
    if (!reactionCounts.some(({ type }) => type === reactionType)) {
      setReactionType(reactionCounts[0]?.type ?? '');
    }
  }, [reactionCounts, reactionType]);

  return (
    <Modal
      accessibilityLabel={title}
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onClose}
      role="dialog"
      transparent
      visible
    >
      <Pressable
        accessibilityLabel={`${title} 닫기`}
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: theme.overlayScrim }]}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.surface, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <TabList
            accessibilityLabel="반응 유형"
            onValueChange={(type) => {
              setFetchKey(0);
              setReactionType(type);
            }}
            value={reactionType}
            variant="pill"
          >
            {reactionCounts.map(({ count, type }) => (
              <Tab
                key={type}
                option={{
                  accessibilityLabel: `${type} 반응 ${count}개`,
                  label: `${type} ${count}`,
                  value: type,
                }}
              />
            ))}
          </TabList>
          <ScrollView contentContainerStyle={styles.content}>
            <RouteBoundary
              key={reactionType}
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
