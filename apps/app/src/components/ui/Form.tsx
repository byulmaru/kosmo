import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type FormProps = PropsWithChildren<{
  accessibilityLabel: string;
  onSubmit: () => void;
  style?: StyleProp<ViewStyle>;
  submitOnModEnter?: boolean;
}>;

export function Form({ accessibilityLabel, children, style }: FormProps) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
      {children}
    </View>
  );
}
