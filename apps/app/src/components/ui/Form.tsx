import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

export type FormProps = PropsWithChildren<{
  accessibilityLabel: string;
  onSubmit: () => void;
  style?: StyleProp<ViewStyle>;
  submitOnModEnter?: boolean;
}> &
  Pick<ViewProps, 'accessibilityElementsHidden' | 'aria-hidden' | 'pointerEvents'>;

export function Form({
  accessibilityLabel,
  accessibilityElementsHidden,
  children,
  'aria-hidden': ariaHidden,
  pointerEvents,
  style,
}: FormProps) {
  return (
    <View
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={ariaHidden}
      pointerEvents={pointerEvents}
      style={style}
    >
      {children}
    </View>
  );
}
