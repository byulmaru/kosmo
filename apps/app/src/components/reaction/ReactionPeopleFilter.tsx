import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getInteractionTargetSize } from '@/components/ui/interactionTarget';
import { Tab, TabList } from '@/components/ui/Tabs';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontFamilies, radius, space, textStyles } from '@/theme/tokens';
import type React from 'react';
import type { ReactionSummaryEntry } from './ReactionSummary';

export type ReactionPeopleFilterProps = {
  entries: ReadonlyArray<ReactionSummaryEntry>;
  onValueChange: (value: string) => void;
  value: string;
};

const collapsedEntryCount = 6;
const toggleSize = getInteractionTargetSize(Platform.OS);

export function ReactionPeopleFilter({
  entries,
  onValueChange,
  value,
}: ReactionPeopleFilterProps): React.ReactElement | null {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const positiveEntries = entries.filter((entry) => entry.count > 0);

  if (positiveEntries.length === 0) {
    return null;
  }

  const selectedIndex = positiveEntries.findIndex((entry) => entry.type === value);
  const collapsedEntries =
    selectedIndex >= collapsedEntryCount
      ? [...positiveEntries.slice(0, collapsedEntryCount - 1), positiveEntries[selectedIndex]!]
      : positiveEntries.slice(0, collapsedEntryCount);
  const visibleEntries = expanded ? positiveEntries : collapsedEntries;
  const hiddenCount = positiveEntries.length - collapsedEntries.length;
  const hasOverflow = hiddenCount > 0;
  return (
    <View style={styles.root}>
      <View style={styles.filterRow}>
        <View style={styles.tabs}>
          <TabList
            accessibilityLabel="반응 유형"
            onValueChange={onValueChange}
            pillInset={false}
            pillWrap={expanded}
            value={value}
            variant="pill"
          >
            {visibleEntries.map((entry) => (
              <Tab
                key={entry.type}
                option={{
                  accessibilityLabel: `${entry.type} 반응 ${entry.count}개`,
                  label: `${entry.type} ${entry.count}`,
                  value: entry.type,
                }}
              />
            ))}
          </TabList>
        </View>
        {hasOverflow ? (
          <Pressable
            accessibilityLabel={
              expanded ? '반응 목록 접기' : `나머지 반응 ${hiddenCount}개 모두 보기`
            }
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => setExpanded((current) => !current)}
            style={({ pressed }) => [
              styles.toggle,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.toggleLabel, { color: theme.text }]}>
              {expanded ? '−' : `+${hiddenCount}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  filterRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space[4], width: '100%' },
  tabs: { flex: 1, minWidth: 0 },
  toggle: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    flexShrink: 0,
    height: toggleSize,
    justifyContent: 'center',
    minWidth: toggleSize,
    paddingHorizontal: space[8],
  },
  toggleLabel: {
    fontFamily: fontFamilies.ui,
    fontWeight: '700',
    ...textStyles.uiLabelM,
  },
});
