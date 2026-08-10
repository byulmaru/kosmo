import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { radius, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';

type StateViewProps = {
  actionLabel?: string;
  alert?: boolean;
  description?: string;
  loading?: boolean;
  onAction?: () => void;
  title: string;
};

export function StateView({
  actionLabel,
  alert = false,
  description,
  loading = false,
  onAction,
  title,
}: StateViewProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={styles.root}>
      {loading ? (
        reducedMotion ? (
          <Text
            accessible={false}
            aria-hidden
            style={[styles.loaderFallback, { color: theme.foregroundPrimary }]}
          >
            ···
          </Text>
        ) : (
          <ActivityIndicator accessibilityLabel={title} color={theme.foregroundPrimary} />
        )
      ) : null}
      <Text style={[styles.title, { color: theme.foregroundPrimary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
          {description}
        </Text>
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
      style={{
        backgroundColor: theme.stateDisabledSurface,
        borderRadius: radius[8],
        height,
        width,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space[8], padding: space[32] },
  title: { textAlign: 'center', ...textStyles.uiLabelL },
  description: { textAlign: 'center', ...textStyles.uiCopyM },
  loaderFallback: textStyles.uiLabelL,
});
