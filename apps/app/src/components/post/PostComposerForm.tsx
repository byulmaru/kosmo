import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type PostComposerFormProps = PropsWithChildren<{
  accessibilityLabel: string;
  onSubmit: () => void;
  style?: StyleProp<ViewStyle>;
}>;

export function PostComposerForm({ accessibilityLabel, children, style }: PostComposerFormProps) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
      {children}
    </View>
  );
}
