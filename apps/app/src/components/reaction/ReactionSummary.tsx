import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import type React from 'react';
import type { ReactionToggleIntent } from './ReactionSelector';

export type ReactionSummaryEntry = Readonly<{ count: number; type: string }>;

export type ReactionSummaryProps = {
  disabled?: boolean;
  entries?: ReadonlyArray<ReactionSummaryEntry>;
  error?: boolean;
  errorTypeIds?: ReadonlyArray<string>;
  loading?: boolean;
  onMore?: () => void;
  onRetry?: () => void;
  onToggle?: (intent: ReactionToggleIntent) => void;
  pendingTypeIds?: ReadonlyArray<string>;
  selectedTypeIds?: ReadonlyArray<string>;
};

const copy = {
  emptyDescription: '가장 먼저 반응을 남겨보세요.',
  emptyTitle: '아직 반응이 없어요',
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응을 불러오지 못했어요',
  loadingTitle: '반응 요약을 불러오는 중입니다.',
} as const;

export function ReactionSummary({
  disabled = false,
  entries,
  error,
  errorTypeIds = [],
  loading,
  onMore,
  onRetry,
  onToggle,
  pendingTypeIds = [],
  selectedTypeIds = [],
}: ReactionSummaryProps): React.ReactElement {
  const theme = useTheme();
  const errorTypes = new Set(errorTypeIds);
  const pendingTypes = new Set(pendingTypeIds);
  const selectedTypes = new Set(selectedTypeIds);

  return (
    <View style={styles.root}>
      {entries !== undefined ? (
        entries.length === 0 ? (
          <StateView description={copy.emptyDescription} title={copy.emptyTitle} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.entries}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.entriesScroll}
            testID="reaction-summary-scroll"
          >
            {entries.map((entry, index) => {
              const entryError = errorTypes.has(entry.type);
              const pending = pendingTypes.has(entry.type);
              const selected = selectedTypes.has(entry.type);
              const entryDisabled = disabled || pending || onToggle === undefined;
              const accessibilityLabel = entryError
                ? `${entry.type} 반응 ${entry.count}개, 오류, 다시 시도`
                : pending
                  ? `${entry.type} 반응 ${entry.count}개, 처리 중`
                  : `${entry.type} 반응 ${entry.count}개`;

              return (
                <Pressable
                  accessibilityLabel={accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ busy: pending, disabled: entryDisabled, selected }}
                  aria-busy={pending}
                  aria-pressed={selected}
                  disabled={entryDisabled}
                  key={`${entry.type}-${index}`}
                  onPress={() => onToggle?.({ nextSelected: !selected, optionId: entry.type })}
                  style={({ pressed }) => [
                    styles.entry,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: selected ? 1 : entryDisabled ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {({ pressed }) => (
                    <>
                      {selected ? (
                        <View
                          style={[
                            styles.entrySelectedBackground,
                            {
                              backgroundColor: pressed ? theme.primaryHover : theme.primary,
                              opacity: 0.7,
                            },
                          ]}
                          testID="reaction-summary-selected-background"
                        />
                      ) : null}
                      <Text style={[styles.entryEmoji, { color: theme.text }]}>{entry.type}</Text>
                      <Text style={[styles.entryCount, { color: theme.text }]}>{entry.count}</Text>
                    </>
                  )}
                </Pressable>
              );
            })}
            {onMore ? (
              <Pressable
                accessibilityLabel="반응한 프로필 보기"
                accessibilityRole="button"
                onPress={onMore}
                style={({ pressed }) => [
                  styles.more,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.moreGlyph, { color: theme.text }]}>…</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )
      ) : error ? (
        <StateView
          actionLabel="다시 시도"
          alert
          description={copy.errorDescription}
          onAction={onRetry}
          title={copy.errorTitle}
        />
      ) : loading ? (
        <StateView loading title={copy.loadingTitle} />
      ) : (
        <StateView description={copy.emptyDescription} title={copy.emptyTitle} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { maxWidth: '100%' },
  entries: { alignItems: 'center', gap: spacing.xs },
  entriesScroll: { flexGrow: 0, maxWidth: '100%' },
  entry: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    position: 'relative',
    ...Platform.select({
      default: { height: 44 },
      web: { height: 32 },
    }),
  },
  entrySelectedBackground: {
    borderRadius: radii.md,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  entryCount: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...Platform.select({
      default: { fontSize: 16, lineHeight: 24 },
      web: { fontSize: 14, lineHeight: 20 },
    }),
  },
  entryEmoji: {
    ...Platform.select({
      default: { fontSize: 16, lineHeight: 24 },
      web: { fontSize: 20, lineHeight: 24 },
    }),
  },
  more: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    ...Platform.select({
      default: { height: 44, width: 44 },
      web: { height: 32, width: 32 },
    }),
  },
  moreGlyph: {
    fontFamily: 'SUIT',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
});
