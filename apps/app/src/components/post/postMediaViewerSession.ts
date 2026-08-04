import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type PostMediaViewerSession = Readonly<{
  identity: string;
  originControl: RefObject<NativeView | null>;
  selectedIndex: number;
}>;

export function createPostMediaViewerSession(
  identity: string,
  selectedIndex: number,
  originControl: RefObject<NativeView | null>,
): PostMediaViewerSession {
  return { identity, originControl, selectedIndex };
}

export function reconcilePostMediaViewerSession(
  session: PostMediaViewerSession | null,
  identity: string,
  available: boolean,
): PostMediaViewerSession | null {
  return available && session?.identity === identity ? session : null;
}

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
