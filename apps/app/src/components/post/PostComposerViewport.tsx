import { useLayoutEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { OverlayBackdrop } from '@/components/ui/Overlay';
import type { ViewProps } from 'react-native';
import type { OverlayCloseReason } from '@/components/ui/Overlay';

type PostComposerViewportProps = ViewProps & {
  fullscreen: boolean;
  onRequestClose?: (reason: OverlayCloseReason) => void;
  open: boolean;
};

export function PostComposerViewport({
  children,
  fullscreen,
  onRequestClose,
  open,
  style,
  ...viewProps
}: PostComposerViewportProps) {
  const [fullscreenViewport, setFullscreenViewport] = useState<{
    height: number;
    offsetTop: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !fullscreen || !open || typeof window === 'undefined') {
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const updateViewport = () => {
      const next = { height: viewport.height, offsetTop: viewport.offsetTop };
      setFullscreenViewport((current) =>
        current?.height === next.height && current.offsetTop === next.offsetTop ? current : next,
      );
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, [fullscreen, open]);

  const fullscreenViewportStyle =
    Platform.OS === 'web' && fullscreen && open && fullscreenViewport
      ? {
          bottom: 'auto' as never,
          height: fullscreenViewport.height,
          left: 0,
          position: 'fixed' as never,
          right: 0,
          top: fullscreenViewport.offsetTop,
        }
      : null;

  return (
    <View {...viewProps} style={[style, fullscreenViewportStyle]}>
      {onRequestClose ? (
        <OverlayBackdrop
          onRequestClose={onRequestClose}
          style={StyleSheet.absoluteFill}
          testID="post-composer-viewport-backdrop"
        />
      ) : null}
      {children}
    </View>
  );
}
