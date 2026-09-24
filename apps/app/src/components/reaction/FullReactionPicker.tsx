import { Search } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ReactionEmojiImage } from './ReactionEmojiImage';
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
  recent?: boolean;
}>;

export type FullReactionPickerProps = {
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  presentation?: 'mobile' | 'web';
  query: string;
  selectedValues?: ReadonlyArray<string>;
  loading?: boolean;
};

export function FullReactionPicker({
  onClose,
  onQueryChange,
  onSelect,
  options,
  presentation = 'web',
  query,
  selectedValues = [],
  loading = false,
}: FullReactionPickerProps): React.ReactElement {
  const theme = useTheme();
  const elevation = useElevation();
  const mobile = presentation === 'mobile';
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
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      ref={pickerRef}
      role={Platform.OS === 'web' ? 'dialog' : undefined}
      style={[
        mobile ? styles.mobileSheet : styles.webDialog,
        mobile ? { height: state === 'browse' ? 480 : 720 } : elevation.overlay,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
      ]}
      testID={mobile ? 'full-reaction-picker-sheet' : undefined}
    >
      {mobile ? (
        <>
          <View style={[styles.dragHandle, { backgroundColor: theme.borderStrong }]} />
          <Text
            accessibilityRole="header"
            style={[styles.mobileTitle, { color: theme.foregroundPrimary }]}
          >
            반응 선택
          </Text>
        </>
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
        <FlatList<ReactionGridItem>
          data={
            state === 'searchResults'
              ? createGridItems('results', '반응', searchResults, mobile ? 7 : 8)
              : createBrowseItems(options, mobile ? 7 : 8)
          }
          initialNumToRender={mobile ? 12 : 10}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            state === 'searchResults' ? (
              <Text style={[styles.resultCount, { color: theme.foregroundSecondary }]}>
                ‘{query}’ 검색 결과 {searchResults.length}개
              </Text>
            ) : null
          }
          maxToRenderPerBatch={mobile ? 12 : 10}
          renderItem={({ item }) =>
            item.kind === 'heading' ? (
              <View style={styles.section} testID={item.testID}>
                <Text
                  accessibilityRole="header"
                  style={[styles.sectionTitle, { color: theme.foregroundPrimary }]}
                >
                  {item.title}
                </Text>
              </View>
            ) : (
              <ReactionGridRow
                mobile={mobile}
                onSelect={onSelect}
                options={item.options}
                rowIndex={item.rowIndex}
                sectionId={item.sectionId}
                selectedValues={selectedValues}
              />
            )
          }
          showsVerticalScrollIndicator={false}
          testID="full-reaction-picker-scroll"
          windowSize={5}
          contentContainerStyle={styles.scrollContent}
        />
      )}
    </View>
  );

  return mobile ? (
    <View style={[styles.mobileRoot, { backgroundColor: theme.overlayScrim }]}>{picker}</View>
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

type ReactionGridItem =
  | Readonly<{ id: string; kind: 'heading'; testID: string; title: string }>
  | Readonly<{
      id: string;
      kind: 'row';
      options: ReadonlyArray<FullReactionPickerOption>;
      rowIndex: number;
      sectionId: string;
    }>;

function createGridItems(
  sectionId: string,
  title: string,
  options: ReadonlyArray<FullReactionPickerOption>,
  columns: number,
): ReactionGridItem[] {
  if (options.length === 0) {
    return [];
  }

  return [
    {
      id: `${sectionId}-heading`,
      kind: 'heading',
      testID: `full-reaction-section-${sectionId}`,
      title,
    },
    ...Array.from({ length: Math.ceil(options.length / columns) }, (_, rowIndex) => ({
      id: `${sectionId}-row-${rowIndex}`,
      kind: 'row' as const,
      options: options.slice(rowIndex * columns, (rowIndex + 1) * columns),
      rowIndex,
      sectionId,
    })),
  ];
}

function createBrowseItems(
  options: ReadonlyArray<FullReactionPickerOption>,
  columns: number,
): ReactionGridItem[] {
  const categories = Array.from(
    new Map(options.map((option) => [option.category, option.categoryLabel])).entries(),
    ([id, title]) => ({ id, options: options.filter((option) => option.category === id), title }),
  );
  return [
    ...createGridItems(
      'quick',
      '빠른 반응',
      options.filter((option) => option.quick),
      columns,
    ),
    ...categories.flatMap(({ id, options: categoryOptions, title }) =>
      createGridItems(id, title, categoryOptions, columns),
    ),
  ];
}

function ReactionGridRow({
  mobile,
  onSelect,
  options,
  rowIndex,
  sectionId,
  selectedValues,
}: {
  mobile: boolean;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  rowIndex: number;
  sectionId: string;
  selectedValues: ReadonlyArray<string>;
}) {
  const theme = useTheme();
  const columns = mobile ? 7 : 8;
  return (
    <View
      style={[
        styles.gridRow,
        mobile ? styles.mobileGrid : styles.webGrid,
        options.length === columns ? styles.fullGridRow : styles.partialGridRow,
      ]}
      testID={`full-reaction-section-${sectionId}-row-${rowIndex}`}
    >
      {options.map((option) => {
        const selected = selectedValues.includes(option.id);
        return (
          <Pressable
            accessibilityLabel={`${option.label} ${option.emoji}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            aria-pressed={selected}
            key={option.id}
            onPress={() => onSelect(option)}
            style={mobile ? styles.mobileReactionTarget : styles.webReactionTarget}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.reaction,
                  mobile ? styles.mobileReaction : styles.webReaction,
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
                <ReactionEmojiImage size={mobile ? 24 : 20} type={option.emoji} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dragHandle: { alignSelf: 'center', borderRadius: radius.full, height: 4, width: 32 },
  emptyDescription: textStyles.uiCopyM,
  emptyTitle: textStyles.uiLabelL,
  fullGridRow: { justifyContent: 'space-between' },
  gridRow: { flexDirection: 'row' },
  mobileGrid: { gap: 0 },
  mobileReaction: { height: 44, width: 44 },
  mobileReactionTarget: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  mobileRoot: { flex: 1, justifyContent: 'flex-end', minHeight: 844 },
  mobileSheet: {
    borderTopLeftRadius: radius[24],
    borderTopRightRadius: radius[24],
    borderWidth: borderWidths[1],
    gap: space[12],
    maxWidth: 390,
    paddingBottom: space[24],
    paddingHorizontal: space[16],
    paddingTop: space[12],
    width: '100%',
  },
  mobileSpinner: { transform: [{ scale: 1.5 }] },
  mobileTitle: { textAlign: 'left', ...textStyles.uiLabelL },
  partialGridRow: { justifyContent: 'flex-start' },
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
    height: 624,
    maxHeight: '100%',
    padding: space[16],
    width: 360,
  },
  webGrid: { gap: space[8] },
  webReaction: { height: 32, width: 32 },
  webReactionTarget: { height: 32, width: 32 },
  webSpinner: { transform: [{ scale: 1.25 }] },
});
