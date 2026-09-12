import { Ellipsis } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing } from '@/theme/tokens';
import { getReactionSummaryLayout } from './reactionSummaryLayout';
import type { Href } from 'expo-router';
import type React from 'react';
import type { LayoutChangeEvent } from 'react-native';
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
  peopleControlId?: string;
  pendingTypeIds?: ReadonlyArray<string>;
  peopleHref?: Href;
  selectedTypeIds?: ReadonlyArray<string>;
};

const copy = {
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응을 불러오지 못했어요',
  loadingTitle: '반응 요약을 불러오는 중입니다.',
} as const;

const summaryControlSize = Platform.OS === 'web' ? 32 : Platform.OS === 'ios' ? 44 : 48;

export function ReactionSummary({
  disabled = false,
  entries,
  error,
  errorTypeIds = [],
  loading,
  onMore,
  onRetry,
  onToggle,
  peopleControlId,
  pendingTypeIds = [],
  peopleHref,
  selectedTypeIds = [],
}: ReactionSummaryProps): React.ReactElement | null {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [entryWidths, setEntryWidths] = useState<Record<string, number>>({});
  const [ellipsisWidth, setEllipsisWidth] = useState<number | null>(null);
  const [overflowWidths, setOverflowWidths] = useState<Record<number, number>>({});
  const errorTypes = new Set(errorTypeIds);
  const pendingTypes = new Set(pendingTypeIds);
  const selectedTypes = new Set(selectedTypeIds);
  const peopleEnabled = Boolean(onMore || peopleHref);
  const currentEntries = entries?.filter((entry) => entry.count > 0) ?? [];
  const entryKeys = currentEntries.map((entry, index) => `${entry.type}-${index}`);
  const measurementsReady =
    peopleEnabled &&
    containerWidth !== null &&
    ellipsisWidth !== null &&
    entryKeys.every((key) => entryWidths[key] !== undefined) &&
    Array.from({ length: currentEntries.length }, (_, index) => index + 1).every(
      (count) => overflowWidths[count] !== undefined,
    );
  const layout = measurementsReady
    ? getReactionSummaryLayout({
        availableWidth: containerWidth,
        entryWidths: entryKeys.map((key) => entryWidths[key]!),
        ellipsisWidth: ellipsisWidth!,
        gap: spacing.xs,
        overflowWidths,
      })
    : null;

  const recordWidth = (width: number, setWidth: (value: number) => void) => {
    if (width > 0) {
      setWidth(width);
    }
  };
  const onContainerLayout = (event: LayoutChangeEvent) => {
    recordWidth(event.nativeEvent.layout.width, setContainerWidth);
  };
  const onEntryLayout = (key: string) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setEntryWidths((current) =>
        current[key] === width ? current : { ...current, [key]: width },
      );
    }
  };
  const onOverflowLayout = (count: number) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setOverflowWidths((current) =>
        current[count] === width ? current : { ...current, [count]: width },
      );
    }
  };

  if (entries !== undefined && currentEntries.length === 0) {
    return null;
  }

  if (entries === undefined) {
    return error ? (
      <StateView
        actionLabel="다시 시도"
        alert
        description={copy.errorDescription}
        onAction={onRetry}
        title={copy.errorTitle}
      />
    ) : loading ? (
      <StateView loading title={copy.loadingTitle} />
    ) : null;
  }

  const renderPeopleControl = (hiddenCount: number) => {
    const overflow = hiddenCount > 0;
    const accessibilityLabel = overflow
      ? `숨겨진 반응 유형 ${hiddenCount}개, 반응한 프로필 보기`
      : '반응한 프로필 보기';
    const control = (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={peopleHref ? 'link' : 'button'}
        nativeID={peopleControlId}
        onPress={peopleHref ? undefined : onMore}
        style={({ pressed }) => [
          styles.moreControl,
          !overflow && styles.ellipsisControl,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {overflow ? (
          <Text style={[styles.moreLabel, { color: theme.text }]}>+{hiddenCount}</Text>
        ) : (
          <Ellipsis color={theme.text} size={20} strokeWidth={2} />
        )}
      </Pressable>
    );

    if (!peopleHref) {
      return control;
    }

    return (
      <NavigationLink href={peopleHref} onNavigate={onMore}>
        {control}
      </NavigationLink>
    );
  };

  const visibleEntries = peopleEnabled
    ? layout
      ? currentEntries.slice(0, layout.visibleCount)
      : []
    : currentEntries;

  return (
    <View onLayout={onContainerLayout} style={styles.root}>
      <View style={styles.entries} testID="reaction-summary-row">
        {visibleEntries.map((entry, index) => {
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
        {peopleEnabled ? renderPeopleControl(layout?.hiddenCount ?? 0) : null}
      </View>

      {peopleEnabled ? (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.measurementLayer}
        >
          {currentEntries.map((entry, index) => (
            <View
              key={`measure-${entry.type}-${index}`}
              onLayout={onEntryLayout(entryKeys[index]!)}
              style={styles.entry}
            >
              <Text style={[styles.entryEmoji, { color: theme.text }]}>{entry.type}</Text>
              <Text style={[styles.entryCount, { color: theme.text }]}>{entry.count}</Text>
            </View>
          ))}
          <View
            onLayout={(event) => recordWidth(event.nativeEvent.layout.width, setEllipsisWidth)}
            style={[styles.moreControl, styles.ellipsisControl]}
          >
            <Ellipsis color={theme.text} size={20} strokeWidth={2} />
          </View>
          {currentEntries.map((_, index) => (
            <View
              key={`measure-overflow-${index + 1}`}
              onLayout={onOverflowLayout(index + 1)}
              style={styles.moreControl}
            >
              <Text style={[styles.moreLabel, { color: theme.text }]}>+{index + 1}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { maxWidth: '100%', position: 'relative', width: '100%' },
  entries: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
  },
  entry: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    height: summaryControlSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    position: 'relative',
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
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  entryEmoji: { fontSize: 20, lineHeight: 24 },
  ellipsisControl: { width: summaryControlSize },
  measurementLayer: {
    flexDirection: 'row',
    left: 0,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  moreControl: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    height: summaryControlSize,
    justifyContent: 'center',
    minWidth: summaryControlSize,
    paddingHorizontal: spacing.sm,
  },
  moreLabel: {
    fontFamily: fontFamilies.ui,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
