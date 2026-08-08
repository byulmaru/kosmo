import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export function focusPostMediaViewerTarget(
  primary: RefObject<NativeView | null>,
  fallback?: RefObject<NativeView | null>,
) {
  const target = usableFocusTarget(primary) ?? (fallback ? usableFocusTarget(fallback) : null);
  target?.focus?.();
}

function usableFocusTarget(ref: RefObject<NativeView | null>) {
  const target = ref.current as unknown as {
    focus?: () => void;
    isConnected?: boolean;
  } | null;
  return target && target.isConnected !== false ? target : null;
}
