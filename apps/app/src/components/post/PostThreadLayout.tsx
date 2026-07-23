import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type React from 'react';

export type PostThreadRole = 'ancestor' | 'current' | 'descendant';

export type PostThreadItem<TPost> = Readonly<{
  connectedToPrevious: boolean;
  id: string;
  post: TPost;
}>;

export type PostThreadRenderArgs<TPost> = Readonly<{
  item: PostThreadItem<TPost>;
  onPress?: () => void;
  role: PostThreadRole;
}>;

export type PostThreadLayoutProps<TPost> = Readonly<{
  ancestors: ReadonlyArray<PostThreadItem<TPost>>;
  current: PostThreadItem<TPost>;
  descendants: ReadonlyArray<PostThreadItem<TPost>>;
  onPostPress?: (postId: string) => void;
  renderPost: (args: PostThreadRenderArgs<TPost>) => React.ReactNode;
}>;

export function PostThreadLayout<TPost>({
  ancestors,
  current,
  descendants,
  onPostPress,
  renderPost,
}: PostThreadLayoutProps<TPost>): React.ReactElement {
  const theme = useTheme();
  const rows = [
    ...ancestors.map((item) => ({ item, role: 'ancestor' as const })),
    { item: current, role: 'current' as const },
    ...descendants.map((item) => ({ item, role: 'descendant' as const })),
  ];

  return (
    <View accessibilityLabel="Reply thread" testID="post-thread">
      {rows.map(({ item, role }, index) => {
        const previous = rows[index - 1];
        const next = rows[index + 1];
        const connectsFromPrevious = item.connectedToPrevious && previous !== undefined;
        const connectsToNext = next?.item.connectedToPrevious === true;

        return (
          <View
            key={item.id}
            role={role === 'current' ? 'article' : undefined}
            style={[
              styles.row,
              role === 'current' && styles.current,
              role === 'current' && { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            testID={
              role === 'current' ? `post-thread-current-${item.id}` : `post-thread-item-${item.id}`
            }
          >
            {connectsFromPrevious ? (
              <View
                style={[
                  styles.connector,
                  role === 'current' ? styles.currentConnectorBefore : styles.listConnectorBefore,
                  { backgroundColor: theme.border, pointerEvents: 'none' },
                ]}
                testID={`post-thread-connector-${previous.item.id}-${item.id}-before`}
              />
            ) : null}
            {connectsToNext ? (
              <View
                style={[
                  styles.connector,
                  role === 'current' ? styles.currentConnectorAfter : styles.listConnectorAfter,
                  { backgroundColor: theme.border, pointerEvents: 'none' },
                ]}
                testID={`post-thread-connector-${item.id}-${next.item.id}-after`}
              />
            ) : null}
            {renderPost({
              item,
              ...(onPostPress ? { onPress: () => onPostPress(item.id) } : {}),
              role,
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative' },
  current: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  connector: {
    left: spacing.xxl,
    position: 'absolute',
    width: 2,
  },
  listConnectorBefore: { height: spacing.xxl, top: 0 },
  listConnectorAfter: { bottom: 0, top: spacing.xxl },
  currentConnectorBefore: { height: spacing.xxl + spacing.xs, top: 0 },
  currentConnectorAfter: { bottom: 0, top: spacing.xxl + spacing.xs },
});
