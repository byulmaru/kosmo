import { ActivityIndicator, Text } from 'react-native';
import { useReducedMotion } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';
import type { ActivityIndicatorProps, StyleProp, TextStyle } from 'react-native';

type LoadingIndicatorProps = Pick<
  ActivityIndicatorProps,
  'accessibilityLabel' | 'color' | 'size' | 'style' | 'testID'
> & {
  accessible?: boolean;
  'aria-hidden'?: boolean;
};

export function LoadingIndicator({
  accessibilityLabel,
  accessible,
  'aria-hidden': ariaHidden,
  color,
  size,
  style,
  testID,
}: LoadingIndicatorProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    const dotsAccessible = accessible ?? (ariaHidden !== true && Boolean(accessibilityLabel));

    return (
      <Text
        accessibilityLabel={accessibilityLabel}
        accessible={dotsAccessible}
        aria-hidden={ariaHidden ?? (dotsAccessible ? undefined : true)}
        style={[textStyles.uiLabelS, color ? { color } : undefined, style as StyleProp<TextStyle>]}
        testID={testID}
      >
        ···
      </Text>
    );
  }

  return (
    <ActivityIndicator
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      aria-hidden={ariaHidden}
      color={color}
      size={size}
      style={style}
      testID={testID}
    />
  );
}
