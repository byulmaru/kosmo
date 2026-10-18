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
  loadingText?: string | null;
  loadingTextStyle?: StyleProp<TextStyle>;
};

export function LoadingIndicator({
  accessibilityLabel,
  accessible,
  'aria-hidden': ariaHidden,
  color,
  loadingText,
  loadingTextStyle,
  size,
  style,
  testID,
}: LoadingIndicatorProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    const reducedTextStyle = [textStyles.uiLabelS, loadingTextStyle, color ? { color } : undefined];
    const reducedLoadingText =
      loadingText === undefined
        ? ariaHidden === true || accessible === false
          ? undefined
          : accessibilityLabel
        : loadingText;
    const reducedDotsAccessible =
      loadingText === null &&
      ariaHidden !== true &&
      accessible !== false &&
      Boolean(accessibilityLabel);
    const reducedLoadingTextAccessible =
      loadingText !== null && ariaHidden !== true && accessible !== false;

    return (
      <>
        <Text
          accessibilityLabel={reducedDotsAccessible ? accessibilityLabel : undefined}
          accessible={reducedDotsAccessible}
          aria-hidden={reducedDotsAccessible ? undefined : (ariaHidden ?? true)}
          style={[...reducedTextStyle, style as StyleProp<TextStyle>]}
          testID={testID}
        >
          ···
        </Text>
        {reducedLoadingText ? (
          <Text
            accessible={reducedLoadingTextAccessible}
            aria-hidden={reducedLoadingTextAccessible ? undefined : true}
            style={reducedTextStyle}
          >
            {reducedLoadingText}
          </Text>
        ) : null}
      </>
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
