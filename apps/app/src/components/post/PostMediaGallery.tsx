import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostMediaImage } from './PostMediaImage';
import type { ReactNode } from 'react';
import type { PostMediaItem, PostMediaOpenHandler } from './PostMediaImage';

export type { PostMediaItem } from './PostMediaImage';

export function PostMediaGallery({
  interactive = true,
  media,
  onMediaOpen,
  sensitive,
}: {
  readonly interactive?: boolean;
  readonly media: ReadonlyArray<PostMediaItem> | null;
  readonly onMediaOpen?: PostMediaOpenHandler;
  readonly sensitive: boolean;
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);

  if (media === null) {
    return (
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.unavailable, { backgroundColor: theme.surface, borderColor: theme.border }]}
        testID="post-media-unavailable"
      >
        <Text style={[styles.unavailableText, { color: theme.textSecondary }]}>
          이미지를 불러올 수 없습니다.
        </Text>
      </View>
    );
  }

  const items = media.slice(0, 4);
  if (items.length === 0) {
    return null;
  }

  const multi = items.length > 1;
  const isRevealed = interactive && revealed;
  const gallery = (
    <View
      style={multi ? [styles.surface, surfaceGeometry(items.length)] : styles.root}
      testID="post-media-gallery"
    >
      {renderMediaSurface(items, (item, index) =>
        multi ? (
          <View
            key={item.id}
            style={tileStyle(items.length)}
            testID={`post-media-tile-${items.length}-${index}`}
          >
            <PostMediaImage
              fill
              index={index}
              interactive={interactive}
              item={item}
              onOpen={interactive ? onMediaOpen : undefined}
            />
          </View>
        ) : (
          <PostMediaImage
            index={index}
            interactive={interactive}
            item={item}
            key={item.id}
            onOpen={interactive ? onMediaOpen : undefined}
          />
        ),
      )}
    </View>
  );

  if (!sensitive) {
    return gallery;
  }

  return (
    <View style={styles.root}>
      {interactive ? (
        <MediaVisibilityButton
          expanded={isRevealed}
          key="media-visibility"
          onPress={() => setRevealed((current) => !current)}
        />
      ) : null}
      {isRevealed ? (
        gallery
      ) : (
        <View
          style={[
            multi ? styles.sensitiveSurface : styles.sensitive,
            multi ? surfaceGeometry(items.length) : styles.singleSensitive,
            { backgroundColor: theme.surface },
            multi ? null : { borderColor: theme.border },
          ]}
          testID="post-media-sensitive"
        >
          {items.length === 2 ? (
            <View
              style={styles.twoItemSensitiveSizer}
              testID="post-media-sensitive-two-item-sizer"
            />
          ) : null}
          <View style={styles.sensitiveContent}>
            <Text style={[styles.sensitiveTitle, { color: theme.text }]}>민감한 이미지</Text>
            <Text style={[styles.sensitiveDescription, { color: theme.textSecondary }]}>
              작성자가 민감한 내용으로 표시했습니다.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function renderMediaSurface(
  items: ReadonlyArray<PostMediaItem>,
  renderTile: (item: PostMediaItem, index: number) => ReactNode,
): ReactNode {
  if (items.length === 1) {
    return renderTile(items[0]!, 0);
  }

  if (items.length === 2) {
    return (
      <View style={styles.twoTileRow} testID="post-media-row-2-0">
        {items.map((item, index) => renderTile(item, index))}
      </View>
    );
  }

  if (items.length === 3) {
    return (
      <View style={styles.surfaceRow} testID="post-media-row-3-0">
        {renderTile(items[0]!, 0)}
        <View style={styles.surfaceColumn} testID="post-media-row-3-1">
          {renderTile(items[1]!, 1)}
          {renderTile(items[2]!, 2)}
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.surfaceRow} testID="post-media-row-4-0">
        {renderTile(items[0]!, 0)}
        {renderTile(items[1]!, 1)}
      </View>
      <View style={styles.surfaceRow} testID="post-media-row-4-1">
        {renderTile(items[2]!, 2)}
        {renderTile(items[3]!, 3)}
      </View>
    </>
  );
}

function surfaceGeometry(count: number) {
  return count === 2 ? null : { aspectRatio: count === 3 ? 16 / 9 : 1 };
}

function tileStyle(count: number) {
  return count === 2 ? styles.squareTile : styles.tile;
}

function MediaVisibilityButton({
  expanded,
  onPress,
}: {
  readonly expanded: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      aria-expanded={expanded}
      accessibilityLabel={expanded ? '민감한 이미지 다시 가리기' : '민감한 이미지 표시'}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.visibilityButton,
        { backgroundColor: pressed ? theme.primaryHover : theme.primary },
      ]}
    >
      <Text style={[styles.visibilityButtonText, { color: theme.text }]}>
        {expanded ? '다시 가리기' : '이미지 표시'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sensitive: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  sensitiveContent: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sensitiveDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  sensitiveTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  singleSensitive: { aspectRatio: 1, width: '100%' },
  sensitiveSurface: {
    borderRadius: radii.md,
    overflow: 'hidden',
    width: '100%',
  },
  surface: {
    borderRadius: radii.md,
    gap: spacing.sm,
    overflow: 'hidden',
    width: '100%',
  },
  surfaceColumn: { flex: 1, gap: spacing.sm, minHeight: 0 },
  surfaceRow: { flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 0 },
  squareTile: { aspectRatio: 1, flex: 1, minWidth: 0, overflow: 'hidden' },
  tile: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  twoItemSensitiveSizer: { aspectRatio: 1, marginBottom: -spacing.sm / 2, width: '50%' },
  twoTileRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  unavailable: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 144,
    padding: spacing.lg,
  },
  unavailableText: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  visibilityButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: spacing.lg,
  },
  visibilityButtonText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
