import { Search } from 'lucide-react-native';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { BottomSheetSurface } from '@/components/ui/BottomSheetSurface';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { getMobileReactionGridLayout } from './reactionGridLayout';
import { ReactionPendingSpinner } from './ReactionPendingSpinner';
import type React from 'react';

export type FullReactionPickerOption = Readonly<{
  category: string;
  categoryLabel: string;
  emoji: string;
  id: string;
  keywords?: ReadonlyArray<string>;
  label: string;
  quick?: boolean;
  quickOrder?: number;
}>;

export type FullReactionPickerProps = {
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  presentation?: 'mobile' | 'web';
  query: string;
  recentValues?: ReadonlyArray<string>;
  selectedValues?: ReadonlyArray<string>;
  pendingOptionIds?: ReadonlyArray<string>;
  errorOptionIds?: ReadonlyArray<string>;
  loading?: boolean;
  webHeight?: number;
};

export function FullReactionPicker({
  onClose,
  onQueryChange,
  onSelect,
  options,
  presentation = 'web',
  query,
  recentValues = [],
  selectedValues = [],
  pendingOptionIds = [],
  errorOptionIds = [],
  loading = false,
  webHeight,
}: FullReactionPickerProps): React.ReactElement {
  const theme = useTheme();
  const elevation = useElevation();
  const { height: viewportHeight, width: viewportWidth, fontScale } = useWindowDimensions();
  const mobile = presentation === 'mobile';
  const compactWeb = !mobile && viewportWidth < breakpoints.compact;
  const { columns, columnGap, targetSize } = mobile
    ? getMobileReactionGridLayout(viewportWidth - 2 * (space[16] + borderWidths[1]), fontScale)
    : { columns: compactWeb ? 6 : 8, columnGap: 0, targetSize: 32 };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = options.filter((option) =>
    [option.emoji, option.label, ...(option.keywords ?? [])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const state = loading
    ? 'loading'
    : normalizedQuery.length === 0
      ? 'browse'
      : searchResults.length > 0
        ? 'searchResults'
        : 'empty';
  const gridSections =
    state === 'searchResults'
      ? [{ id: 'results', title: '반응', options: searchResults }]
      : state === 'browse'
        ? createBrowseSections(options, recentValues, columns)
        : [];
  const gridItems = [
    ...(state === 'searchResults'
      ? [{ kind: 'count' as const, count: searchResults.length, query }]
      : []),
    ...gridSections.flatMap((section, sectionIndex) => [
      { kind: 'heading' as const, sectionId: section.id, sectionIndex, title: section.title },
      ...Array.from({ length: Math.ceil(section.options.length / columns) }, (_, rowIndex) => ({
        kind: 'row' as const,
        options: section.options.slice(rowIndex * columns, (rowIndex + 1) * columns),
        rowIndex,
        sectionId: section.id,
      })),
    ]),
  ];
  let itemOffset = 0;
  const itemLayouts = gridItems.map((item) => {
    const length =
      item.kind === 'count'
        ? (textStyles.uiCopyS.lineHeight ?? 0) + space[16]
        : item.kind === 'heading'
          ? (textStyles.uiLabelM.lineHeight ?? 0) +
            space[8] +
            (item.sectionIndex > 0 ? space[16] : 0)
          : targetSize + (item.rowIndex > 0 && !mobile ? space[8] : 0);
    const layout = { length, offset: itemOffset };
    itemOffset += length;
    return layout;
  });
  const webEscapeProps: Record<string, unknown> =
    !mobile && Platform.OS === 'web'
      ? {
          onKeyUp: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          },
        }
      : {};
  const picker = (
    <View
      accessibilityLabel="반응 선택"
      onAccessibilityEscape={onClose}
      {...webEscapeProps}
      role={!mobile && Platform.OS === 'web' ? 'dialog' : undefined}
      style={[
        mobile ? styles.mobileSheetContent : styles.webDialog,
        !mobile && elevation.overlay,
        !mobile && {
          height:
            webHeight ??
            Math.min(compactWeb ? 420 : 624, Math.max(0, viewportHeight - 2 * space[8])),
          maxWidth: compactWeb ? 288 : 360,
        },
        !mobile && { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
      ]}
    >
      {mobile ? (
        <Text
          accessibilityRole="header"
          style={[styles.mobileTitle, { color: theme.foregroundPrimary }]}
        >
          반응 선택
        </Text>
      ) : null}
      <SearchField onChange={onQueryChange} value={query} />
      {state === 'loading' ? (
        <View
          accessibilityLabel="반응을 불러오는 중"
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: true }}
          aria-busy
          role={Platform.OS === 'web' ? 'status' : undefined}
          style={styles.state}
        >
          <View style={mobile ? styles.mobileSpinner : styles.webSpinner}>
            <ReactionPendingSpinner />
          </View>
        </View>
      ) : state === 'empty' ? (
        <View accessibilityLiveRegion="polite" style={styles.state}>
          <Text style={[styles.emptyTitle, { color: theme.foregroundPrimary }]}>
            검색 결과가 없어요
          </Text>
          <Text style={[styles.emptyDescription, { color: theme.foregroundSecondary }]}>
            다른 이름이나 이모지로 검색해 보세요.
          </Text>
        </View>
      ) : (
        <FlatList
          key={normalizedQuery}
          contentContainerStyle={styles.scrollContent}
          data={gridItems}
          getItemLayout={
            Platform.OS === 'web'
              ? (_data, index) => ({ ...itemLayouts[index]!, index })
              : undefined
          }
          initialNumToRender={12}
          keyExtractor={(item) =>
            item.kind === 'count'
              ? 'count'
              : `${item.sectionId}-${item.kind}-${item.kind === 'row' ? item.rowIndex : 'heading'}`
          }
          maxToRenderPerBatch={8}
          renderItem={({ item }) =>
            item.kind === 'count' ? (
              <Text
                style={[
                  styles.resultCount,
                  styles.resultCountSpacing,
                  { color: theme.foregroundSecondary },
                ]}
              >
                ‘{item.query}’ 검색 결과 {item.count}개
              </Text>
            ) : item.kind === 'heading' ? (
              <View
                style={[styles.sectionHeading, item.sectionIndex > 0 && styles.sectionSpacing]}
                testID={`full-reaction-section-${item.sectionId}`}
              >
                <Text
                  accessibilityRole="header"
                  style={[styles.sectionTitle, { color: theme.foregroundPrimary }]}
                >
                  {item.title}
                </Text>
              </View>
            ) : (
              <View style={item.rowIndex > 0 && !mobile && styles.webRowSpacing}>
                <ReactionGridRow
                  columnGap={columnGap}
                  columns={columns}
                  mobile={mobile}
                  onSelect={onSelect}
                  options={item.options}
                  rowIndex={item.rowIndex}
                  sectionId={item.sectionId}
                  targetSize={targetSize}
                  selectedValues={selectedValues}
                  pendingValues={pendingOptionIds}
                  errorValues={errorOptionIds}
                />
              </View>
            )
          }
          showsVerticalScrollIndicator={mobile || compactWeb}
          testID="full-reaction-picker-scroll"
          updateCellsBatchingPeriod={16}
          // Web keeps a wide window for Tab traversal; Native mounts nearby rows.
          windowSize={Platform.OS === 'web' ? 100 : 5}
        />
      )}
    </View>
  );

  return mobile ? (
    <BottomSheetSurface
      handleTestID="full-reaction-picker-drag-handle"
      initialHeight={state === 'browse' ? 480 : 720}
      onClose={onClose}
      style={styles.mobileSheetSurface}
      testID="full-reaction-picker-sheet"
    >
      {picker}
    </BottomSheetSurface>
  ) : (
    picker
  );
}

function SearchField({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.search,
        { backgroundColor: theme.backgroundSurface, borderColor: theme.borderDefault },
      ]}
    >
      <Search color={theme.foregroundSecondary} size={iconSizes[20]} strokeWidth={2} />
      <TextInput
        accessibilityLabel="반응 검색"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={Platform.OS === 'web'}
        onChangeText={onChange}
        placeholder="반응 검색"
        placeholderTextColor={theme.foregroundMuted}
        role={Platform.OS === 'web' ? 'searchbox' : undefined}
        style={[styles.searchInput, { color: theme.foregroundPrimary }]}
        value={value}
      />
    </View>
  );
}

type ReactionGridSection = Readonly<{
  id: string;
  options: ReadonlyArray<FullReactionPickerOption>;
  title: string;
}>;

function createBrowseSections(
  options: ReadonlyArray<FullReactionPickerOption>,
  recentValues: ReadonlyArray<string>,
  columns: number,
): ReactionGridSection[] {
  const categories = Array.from(
    new Map(options.map((option) => [option.category, option.categoryLabel])).entries(),
    ([id, title]) => ({ id, options: options.filter((option) => option.category === id), title }),
  );
  const recentOptions = recentValues
    .flatMap((id) => options.find((option) => option.id === id) ?? [])
    .slice(0, columns * 2);
  return [
    ...(options.some((option) => option.quick)
      ? [
          {
            id: 'quick',
            title: '빠른 반응',
            options: options
              .filter((option) => option.quick)
              .sort((left, right) => (left.quickOrder ?? 0) - (right.quickOrder ?? 0)),
          },
        ]
      : []),
    ...(recentOptions.length > 0
      ? [{ id: 'recent', title: '최근 사용', options: recentOptions }]
      : []),
    ...categories,
  ];
}

function ReactionGridRow({
  columnGap,
  columns,
  mobile,
  onSelect,
  options,
  rowIndex,
  sectionId,
  targetSize,
  selectedValues,
  pendingValues,
  errorValues,
}: {
  columnGap: number;
  columns: number;
  mobile: boolean;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  rowIndex: number;
  sectionId: string;
  targetSize: number;
  selectedValues: ReadonlyArray<string>;
  pendingValues: ReadonlyArray<string>;
  errorValues: ReadonlyArray<string>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.gridRow,
        mobile ? { columnGap } : styles.webGrid,
        !mobile &&
          (options.length === columns || sectionId === 'quick'
            ? styles.fullGridRow
            : styles.partialGridRow),
      ]}
      testID={`full-reaction-section-${sectionId}-row-${rowIndex}`}
    >
      {options.map((option) => {
        const selected = selectedValues.includes(option.id);
        const pending = pendingValues.includes(option.id);
        const error = errorValues.includes(option.id);
        const accessibilityLabel = error
          ? `${option.label} 반응, 오류, 다시 시도 ${option.emoji}`
          : pending
            ? `${option.label} 반응, 처리 중 ${option.emoji}`
            : `${option.label} ${option.emoji}`;
        return (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: pending, disabled: pending, selected }}
            aria-busy={pending}
            aria-pressed={selected}
            disabled={pending}
            key={option.id}
            onPress={() => onSelect(option)}
            style={
              mobile
                ? [styles.mobileReactionTarget, { height: targetSize, width: targetSize }]
                : styles.webReactionTarget
            }
          >
            {(state) => (
              <View
                style={[
                  styles.reaction,
                  mobile ? { height: targetSize - 4, width: targetSize - 4 } : styles.webReaction,
                  {
                    backgroundColor: selected
                      ? theme.stateSelectedSurface
                      : state.pressed
                        ? theme.statePressed
                        : Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered)
                          ? theme.stateHover
                          : 'transparent',
                    borderColor: selected ? theme.stateSelectedBorder : 'transparent',
                  },
                ]}
              >
                <Text style={mobile ? styles.mobileEmoji : styles.webEmoji}>{option.emoji}</Text>
                {pending ? (
                  <View accessibilityElementsHidden aria-hidden style={styles.pendingOverlay}>
                    <ReactionPendingSpinner />
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      })}
      {!mobile && sectionId === 'quick'
        ? Array.from({ length: Math.max(0, columns - options.length) }, (_, index) => (
            <View
              accessible={false}
              aria-hidden
              key={`empty-${index}`}
              style={styles.webReactionTarget}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyDescription: textStyles.uiCopyM,
  emptyTitle: textStyles.uiLabelL,
  mobileEmoji: { fontSize: 24, lineHeight: 32, textAlign: 'center' },
  fullGridRow: { justifyContent: 'space-between' },
  gridRow: { flexDirection: 'row' },
  mobileReactionTarget: { alignItems: 'center', justifyContent: 'center' },
  mobileSheetContent: {
    flex: 1,
    gap: space[12],
    paddingBottom: space[24],
    paddingHorizontal: space[16],
    paddingTop: space[12],
    width: '100%',
  },
  mobileSheetSurface: {
    borderTopLeftRadius: radius[24],
    borderTopRightRadius: radius[24],
  },
  mobileSpinner: { transform: [{ scale: 1.5 }] },
  mobileTitle: { textAlign: 'left', ...textStyles.uiLabelL },
  partialGridRow: { justifyContent: 'flex-start' },
  pendingOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  reaction: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    justifyContent: 'center',
  },
  scrollContent: { paddingBottom: space[8] },
  resultCount: textStyles.uiCopyS,
  resultCountSpacing: { marginBottom: space[16] },
  search: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    height: 44,
    paddingHorizontal: space[12],
  },
  searchInput: {
    flex: 1,
    padding: 0,
    // Keep focused Web inputs at 16px to avoid iPhone browser auto-zoom.
    ...Platform.select({ web: textStyles.uiCopyL, default: textStyles.uiCopyM }),
  },
  sectionHeading: { marginBottom: space[8] },
  sectionSpacing: { marginTop: space[16] },
  sectionTitle: textStyles.uiLabelM,
  state: { alignItems: 'center', flex: 1, gap: space[8], justifyContent: 'center' },
  webDialog: {
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    gap: space[16],
    padding: space[16],
    maxWidth: 360,
    width: '100%',
  },
  webGrid: { gap: space[8] },
  webRowSpacing: { marginTop: space[8] },
  webEmoji: { fontSize: 20, lineHeight: 24, textAlign: 'center' },
  webReaction: { height: 32, width: 32 },
  webReactionTarget: { height: 32, width: 32 },
  webSpinner: { transform: [{ scale: 1.25 }] },
});
