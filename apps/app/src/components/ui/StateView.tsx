import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { Button } from './Button';

type StateViewProps = {
  actionLabel?: string;
  description?: string;
  loading?: boolean;
  onAction?: () => void;
  title: string;
};

export function StateView({
  actionLabel,
  description,
  loading = false,
  onAction,
  title,
}: StateViewProps) {
  const theme = useTheme();

  return (
    <View accessibilityRole={loading ? undefined : 'alert'} style={styles.root}>
      {loading ? <ActivityIndicator accessibilityLabel={title} color={theme.text} /> : null}
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button onPress={onAction} tone="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function Skeleton({
  height = 20,
  width = '100%',
}: {
  height?: number;
  width?: number | `${number}%`;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{ backgroundColor: theme.surface, borderRadius: 8, height, width }}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  title: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  description: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
});
