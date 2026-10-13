import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { createPostDetailBackgroundResponder } from './postDetailBackgroundResponder';
import type { ViewProps } from 'react-native';

export function PostDetailBackground({
  onBackgroundPress,
  onLayout,
  ...props
}: ViewProps & { onBackgroundPress?: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Keep host geometry across callback changes; keep the gesture across feedback renders.
  const responder = useMemo(
    () =>
      onBackgroundPress ? createPostDetailBackgroundResponder(onBackgroundPress, size) : undefined,
    [onBackgroundPress, size],
  );
  return (
    <View
      {...props}
      {...responder}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
        onLayout?.(event);
      }}
    />
  );
}
