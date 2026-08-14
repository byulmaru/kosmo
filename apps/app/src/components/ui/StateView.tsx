import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { radius, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import type { StyleProp, ViewStyle } from 'react-native';

type StateViewProps = {
  actionLabel?: string;
  actionStyle?: StyleProp<ViewStyle>;
  alert?: boolean;
  description?: string;
  loading?: boolean;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function StateView({
  actionLabel,
  actionStyle,
  alert = false,
  description,
  loading = false,
  onAction,
  style,
  title,
}: StateViewProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <View
      accessibilityRole={alert ? 'alert' : undefined}
      style={[
        styles.root,
        ...(style ? [style] : []),
        ...(alert
          ? [{ backgroundColor: theme.feedbackDangerSubtle, borderRadius: radius[12] }]
          : []),
      ]}
    >
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
      <Text
        style={[
          styles.title,
          { color: alert ? theme.feedbackDangerOnSubtle : theme.foregroundPrimary },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            styles.description,
            { color: alert ? theme.feedbackDangerOnSubtle : theme.foregroundSecondary },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button onPress={onAction} style={actionStyle} tone="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function Skeleton({
  circular = false,
  height = 20,
  style,
  width = '100%',
}: {
  circular?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  width?: number | `${number}%`;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={[
        style,
        {
          backgroundColor: theme.stateDisabledSurface,
          borderRadius: circular ? radius.full : radius[8],
          height,
          width,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space[8], padding: space[32] },
  title: { textAlign: 'center', ...textStyles.uiLabelL },
  description: { textAlign: 'center', ...textStyles.uiCopyM },
  loaderFallback: textStyles.uiLabelL,
});
