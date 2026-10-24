import { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OverlayPortal } from '@/components/ui/OverlayPortal';
import { spacing } from '@/theme/tokens';
import type { PostComposerProfilePickerLayerProps } from './PostComposerProfilePickerLayer';

export function PostComposerProfilePickerLayer({
  children,
  open,
  pickerRef,
  triggerRef,
}: PostComposerProfilePickerLayerProps) {
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 });
  // Anchor geometry and the visual viewport are browser-owned, including keyboard/zoom changes.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const ownerWindow = trigger?.ownerDocument.defaultView;
    if (!trigger || !ownerWindow) {
      return;
    }
    const viewport = ownerWindow.visualViewport;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      const leftEdge = (viewport?.offsetLeft ?? 0) + spacing.sm;
      const topEdge = (viewport?.offsetTop ?? 0) + spacing.sm;
      const rightEdge =
        (viewport?.offsetLeft ?? 0) + (viewport?.width ?? ownerWindow.innerWidth) - spacing.sm;
      const bottomEdge =
        (viewport?.offsetTop ?? 0) + (viewport?.height ?? ownerWindow.innerHeight) - spacing.sm;
      const top = Math.max(topEdge, Math.min(rect.bottom + spacing.sm, bottomEdge - 160));
      setPosition({
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - 280)),
        top,
        maxHeight: Math.max(0, Math.min(430, bottomEdge - top)),
      });
    };
    update();
    ownerWindow.addEventListener('resize', update);
    trigger.ownerDocument.addEventListener('scroll', update, true);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      ownerWindow.removeEventListener('resize', update);
      trigger.ownerDocument.removeEventListener('scroll', update, true);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [open, triggerRef]);
  if (!open) {
    return null;
  }
  return (
    <OverlayPortal>
      <View
        ref={pickerRef}
        testID="post-composer-profile-picker"
        style={[
          styles.layer,
          { left: position.left, top: position.top, opacity: position.maxHeight ? 1 : 0 },
        ]}
      >
        {children(position.maxHeight)}
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({
  // The Host portal escapes transformed ScrollViews while retaining the Composer focus scope.
  layer: { position: 'fixed' as never, zIndex: 30 },
});
