import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import type React from 'react';

export type PostThreadRole = 'ancestor' | 'current' | 'descendant';

export type PostThreadItem<TPost> = Readonly<{
  connectedToPrevious: boolean;
  id: string;
  post: TPost;
}>;

export type PostThreadRenderArgs<TPost> = Readonly<{
  item: PostThreadItem<TPost>;
  role: PostThreadRole;
}>;

export type PostThreadLayoutProps<TPost> = Readonly<{
  ancestors: ReadonlyArray<PostThreadItem<TPost>>;
  current: PostThreadItem<TPost>;
  descendants: ReadonlyArray<PostThreadItem<TPost>>;
  renderPost: (args: PostThreadRenderArgs<TPost>) => React.ReactNode;
}>;

export function PostThreadLayout<TPost>({
  ancestors,
  current,
  descendants,
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
        const renderedPost = renderPost({ item, role });

        return (
          <View
            key={item.id}
            aria-current={role === 'current' ? true : undefined}
            role={role === 'current' ? 'article' : undefined}
            style={[styles.row, role === 'current' && { backgroundColor: theme.card }]}
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
            {role === 'current' ? (
              <View style={styles.currentContent}>{renderedPost}</View>
            ) : (
              renderedPost
            )}
            {index < rows.length - 1 ? (
              <View
                style={[styles.divider, { backgroundColor: theme.divider }]}
                testID={`post-thread-divider-${item.id}`}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative' },
  currentContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  divider: {
    height: 1,
    marginLeft: spacing.xxl * 2,
    marginRight: spacing.sm,
  },
  connector: {
    borderRadius: radii.full,
    left: spacing.xxl,
    position: 'absolute',
    width: 2,
    zIndex: 1,
  },
  listConnectorBefore: { height: spacing.sm - spacing.xs, top: 0 },
  listConnectorAfter: {
    bottom: 0,
    top: spacing.sm + spacing.xxxl + spacing.xs,
  },
  currentConnectorBefore: { height: spacing.lg - spacing.xs, top: 0 },
  currentConnectorAfter: {
    bottom: 0,
    top: spacing.lg + spacing.xxl + spacing.sm + spacing.xs,
  },
});
