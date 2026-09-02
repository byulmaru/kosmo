import { Search } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
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
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  presentation?: 'mobile' | 'web';
  query: string;
  selectedValues?: ReadonlyArray<string>;
  loading?: boolean;
};

const categoryIcons: Readonly<Record<string, string>> = {
  activities: '🎉',
  expressions: '😀',
  gestures: '👋',
  nature: '🌿',
  symbols: '♡',
};

export function FullReactionPicker({
  activeCategory,
  onCategoryChange,
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
  const categories = Array.from(
    new Map(options.map((option) => [option.category, option.categoryLabel])).entries(),
    ([id, label]) => ({ id, label }),
  );
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
  const picker = (
    <View
      accessibilityLabel="반응 선택"
      accessibilityViewIsModal
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID={mobile ? 'full-reaction-picker-scroll' : undefined}
        >
          {state === 'searchResults' ? (
            <>
              <Text style={[styles.resultCount, { color: theme.foregroundSecondary }]}>
                ‘{query}’ 검색 결과 {searchResults.length}개
              </Text>
              <ReactionSection
                mobile={mobile}
                onSelect={onSelect}
                options={searchResults}
                selectedValues={selectedValues}
                title="반응"
              />
            </>
          ) : (
            <>
              <ReactionSection
                mobile={mobile}
                onSelect={onSelect}
                options={options.filter((option) => option.quick)}
                selectedValues={selectedValues}
                title="빠른 반응"
              />
              <ReactionSection
                mobile={mobile}
                onSelect={onSelect}
                options={options.filter((option) => option.recent)}
                selectedValues={selectedValues}
                title="최근 사용"
              />
              <View style={styles.categories}>
                {categories.map((category) => {
                  const selected = category.id === activeCategory;
                  return (
                    <Pressable
                      accessibilityLabel={`${category.label} category 보기`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={category.id}
                      onPress={() => onCategoryChange(category.id)}
                      style={({ pressed }) => [
                        styles.category,
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
                      <Text style={styles.categoryIcon}>{categoryIcons[category.id] ?? '•'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {categories.map((category) => (
                <ReactionSection
                  key={category.id}
                  mobile={mobile}
                  onSelect={onSelect}
                  options={options.filter((option) => option.category === category.id)}
                  selectedValues={selectedValues}
                  title={category.label}
                />
              ))}
            </>
          )}
        </ScrollView>
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

function ReactionSection({
  mobile,
  onSelect,
  options,
  selectedValues,
  title,
}: {
  mobile: boolean;
  onSelect: (option: FullReactionPickerOption) => void;
  options: ReadonlyArray<FullReactionPickerOption>;
  selectedValues: ReadonlyArray<string>;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.foregroundPrimary }]}>{title}</Text>
      <View style={[styles.grid, mobile ? styles.mobileGrid : styles.webGrid]}>
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
                  <Text style={mobile ? styles.mobileEmoji : styles.webEmoji}>{option.emoji}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  categories: { flexDirection: 'row', justifyContent: 'space-between' },
  category: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  categoryIcon: { fontSize: 20, lineHeight: 24 },
  dragHandle: { alignSelf: 'center', borderRadius: radius.full, height: 4, width: 32 },
  emptyDescription: textStyles.uiCopyM,
  emptyTitle: textStyles.uiLabelL,
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  mobileEmoji: { fontSize: 24, lineHeight: 32 },
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
    padding: space[16],
    width: 360,
  },
  webEmoji: { fontSize: 20, lineHeight: 24 },
  webGrid: { gap: space[8] },
  webReaction: { height: 32, width: 32 },
  webReactionTarget: { height: 32, width: 32 },
  webSpinner: { transform: [{ scale: 1.25 }] },
});
