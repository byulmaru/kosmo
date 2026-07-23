import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type React from 'react';

export type ReactionSummaryEntry = Readonly<{ count: number; type: string }>;

export type ReactionSummaryProps = {
  entries?: ReadonlyArray<ReactionSummaryEntry>;
  error?: boolean;
  loading?: boolean;
  onRetry?: () => void;
  onSelectType?: (type: string) => void;
};

const copy = {
  emptyDescription: '가장 먼저 반응을 남겨보세요.',
  emptyTitle: '아직 반응이 없어요',
  errorDescription: '잠시 후 다시 시도해주세요.',
  errorTitle: '반응을 불러오지 못했어요',
  loadingTitle: '반응 요약을 불러오는 중입니다.',
  title: '반응',
} as const;

export function ReactionSummary({
  entries,
  error,
  loading,
  onRetry,
  onSelectType,
}: ReactionSummaryProps): React.ReactElement {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {copy.title}
      </Text>
      {entries !== undefined ? (
        entries.length === 0 ? (
          <StateView description={copy.emptyDescription} title={copy.emptyTitle} />
        ) : (
          <View style={styles.entries}>
            {entries.map((entry, index) =>
              onSelectType ? (
                <Pressable
                  accessibilityLabel={`${entry.type} 반응 ${entry.count}개 보기`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: false }}
                  key={`${entry.type}-${index}`}
                  onPress={() => onSelectType(entry.type)}
                  style={({ pressed }) => [
                    styles.entry,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.entryLabel, { color: theme.text }]}>
                    {entry.type} {entry.count}
                  </Text>
                </Pressable>
              ) : (
                <View
                  key={`${entry.type}-${index}`}
                  style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <Text style={[styles.entryLabel, { color: theme.text }]}>
                    {entry.type} {entry.count}
                  </Text>
                </View>
              ),
            )}
          </View>
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
  root: { gap: spacing.md },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
  entries: { gap: spacing.sm },
  entry: {
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  entryLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
});
