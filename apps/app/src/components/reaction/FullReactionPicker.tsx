import { Search } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { BottomSheetSurface } from '@/components/ui/BottomSheetSurface';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ReactionEmojiImage } from './ReactionEmojiImage';
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
  onBackdropPress?: () => void;
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
  onBackdropPress,
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
  const pickerRef = useRef<View>(null);
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
  useEffect(() => {
    if (mobile) {
      return;
    }

    const ownerDocument = (pickerRef.current as unknown as HTMLElement | null)?.ownerDocument;
    if (!ownerDocument) {
      return;
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    ownerDocument.addEventListener('keyup', onKeyUp, true);
    return () => ownerDocument.removeEventListener('keyup', onKeyUp, true);
  }, [mobile, onClose]);
  const picker = (
    <View
      accessibilityLabel="반응 선택"
      onAccessibilityEscape={onClose}
      ref={pickerRef}
      role={Platform.OS === 'web' ? 'dialog' : undefined}
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="full-reaction-picker-scroll"
        >
          {state === 'searchResults' ? (
            <Text style={[styles.resultCount, { color: theme.foregroundSecondary }]}>
              ‘{query}’ 검색 결과 {searchResults.length}개
            </Text>
          ) : null}
          {gridSections.map((section) => (
            <View
              key={`${section.id}-heading`}
              style={styles.section}
              testID={`full-reaction-section-${section.id}`}
            >
              <Text
                accessibilityRole="header"
                style={[styles.sectionTitle, { color: theme.foregroundPrimary }]}
              >
                {section.title}
              </Text>
              <View style={mobile ? styles.mobileGrid : styles.webGrid}>
                {Array.from(
                  { length: Math.ceil(section.options.length / columns) },
                  (_, rowIndex) => (
                    <ReactionGridRow
                      key={`${section.id}-row-${rowIndex}`}
                      columnGap={columnGap}
                      columns={columns}
                      mobile={mobile}
                      onSelect={onSelect}
                      options={section.options.slice(rowIndex * columns, (rowIndex + 1) * columns)}
                      rowIndex={rowIndex}
                      sectionId={section.id}
                      targetSize={targetSize}
                      selectedValues={selectedValues}
                      pendingValues={pendingOptionIds}
                      errorValues={errorOptionIds}
                    />
                  ),
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return mobile ? (
    <View
      onResponderRelease={(event) => {
        if (event.target === event.currentTarget) {
          (onBackdropPress ?? onClose)();
        }
      }}
      onStartShouldSetResponder={(event) => event.target === event.currentTarget}
      style={[styles.mobileRoot, !onBackdropPress && { backgroundColor: theme.overlayScrim }]}
      testID="full-reaction-picker-backdrop"
    >
      <BottomSheetSurface
        handleTestID="full-reaction-picker-drag-handle"
        initialHeight={state === 'browse' ? 480 : 720}
        onClose={onClose}
        style={styles.mobileSheetSurface}
        testID="full-reaction-picker-sheet"
      >
        {picker}
      </BottomSheetSurface>
    </View>
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
      ? [{
          id: 'quick',
          title: '빠른 반응',
          options: options
            .filter((option) => option.quick)
            .sort((left, right) => (left.quickOrder ?? 0) - (right.quickOrder ?? 0)),
        }]
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
            {({ pressed }) => (
              <View
                style={[
                  styles.reaction,
                  mobile ? { height: targetSize - 4, width: targetSize - 4 } : styles.webReaction,
                  {
                    backgroundColor: selected
                      ? theme.stateSelectedSurface
                      : pressed
                        ? theme.statePressed
                        : 'transparent',
                    borderColor: selected ? theme.stateSelectedBorder : 'transparent',
                  },
                ]}
              >
                <ReactionEmojiImage size={mobile ? targetSize / 2 : 20} type={option.emoji} />
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
  fullGridRow: { justifyContent: 'space-between' },
  gridRow: { flexDirection: 'row' },
  mobileReactionTarget: { alignItems: 'center', justifyContent: 'center' },
  mobileRoot: { flex: 1, justifyContent: 'flex-end', minHeight: 0 },
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
  scrollContent: { gap: space[16], paddingBottom: space[8] },
  resultCount: textStyles.uiCopyS,
  search: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    height: 44,
    paddingHorizontal: space[12],
  },
  searchInput: { flex: 1, padding: 0, ...textStyles.uiCopyM },
  section: { gap: space[8] },
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
  webReaction: { height: 32, width: 32 },
  webReactionTarget: { height: 32, width: 32 },
  webSpinner: { transform: [{ scale: 1.25 }] },
});
