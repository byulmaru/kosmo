import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { OverlayPortal } from './OverlayPortal';
import type { DropdownProps } from './Dropdown';

export function Dropdown({
  children,
  onRequestClose,
  open,
  active = open,
  triggerRef,
  testID,
  minWidth = 128,
  zIndex = 30,
  anchorInset = 0,
  viewportInset = spacing.sm,
  maxHeight = 430,
  placement,
  horizontalPlacement = 'start',
  verticalPlacement = 'after',
}: DropdownProps) {
  // Geometry and event containment require the actual platform elements.
  const contentRef = useRef<View>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight });
  // Observe browser-owned anchor/visual viewport changes, including keyboard and zoom.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const content = contentRef.current as unknown as HTMLElement | null;
    const ownerWindow = trigger?.ownerDocument.defaultView;
    if (!trigger || !ownerWindow) {
      return;
    }
    const viewport = ownerWindow.visualViewport;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const rightEdge = leftEdge + (viewport?.width ?? ownerWindow.innerWidth);
      const bottomEdge = topEdge + (viewport?.height ?? ownerWindow.innerHeight);
      const width = content?.getBoundingClientRect().width || minWidth;
      const height = content?.getBoundingClientRect().height || 0;
      const inset = viewportInset;
      const anchoredLeft =
        placement === 'overlap-end'
          ? rect.right - width
          : horizontalPlacement === 'after'
            ? rect.right + spacing.sm
            : horizontalPlacement === 'end'
              ? rect.right + anchorInset - width
              : rect.left - anchorInset;
      const anchoredTop =
        placement === 'overlap-end'
          ? rect.top + height > bottomEdge
            ? rect.bottom - height
            : rect.top
          : verticalPlacement === 'after'
            ? rect.bottom + spacing.sm
            : verticalPlacement === 'end'
              ? rect.bottom - height
              : rect.top - anchorInset;
      const availableHeight = Math.max(0, Math.min(maxHeight, bottomEdge - topEdge - inset * 2));
      const top = Math.max(
        topEdge + inset,
        Math.min(
          anchoredTop,
          bottomEdge - inset - Math.min(height || availableHeight, availableHeight),
        ),
      );
      const next = {
        left: Math.max(leftEdge + inset, Math.min(anchoredLeft, rightEdge - inset - width)),
        top,
        maxHeight: Math.max(0, Math.min(maxHeight, bottomEdge - inset - top)),
      };
      setPosition((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (content) {
      observer?.observe(content);
    }
    ownerWindow.addEventListener('resize', update);
    trigger.ownerDocument.addEventListener('scroll', update, true);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer?.disconnect();
      ownerWindow.removeEventListener('resize', update);
      trigger.ownerDocument.removeEventListener('scroll', update, true);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [
    anchorInset,
    horizontalPlacement,
    maxHeight,
    minWidth,
    open,
    placement,
    triggerRef,
    verticalPlacement,
    viewportInset,
  ]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const ownerDocument = trigger?.ownerDocument;
    if (!trigger || !ownerDocument) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const content = contentRef.current as unknown as HTMLElement | null;
      if (!trigger.contains(event.target as Node) && !content?.contains(event.target as Node)) {
        onRequestClose('outside');
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // RN Web Modal closes on keyup regardless of keydown.defaultPrevented.
        // Keep the dropdown mounted until this event is consumed before its parent modal.
        event.preventDefault();
        event.stopPropagation();
        onRequestClose('escape');
      }
    };
    ownerDocument.addEventListener('pointerdown', onPointerDown);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    ownerDocument.addEventListener('keyup', onKeyUp, true);
    return () => {
      ownerDocument.removeEventListener('pointerdown', onPointerDown);
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
      ownerDocument.removeEventListener('keyup', onKeyUp, true);
    };
  }, [active, onRequestClose, triggerRef]);

  if (!open) {
    return null;
  }
  return (
    <OverlayPortal>
      <View
        ref={contentRef}
        {...{ dataSet: { dropdownOpen: active ? 'true' : undefined } }}
        testID={testID}
        style={[
          styles.layer,
          { left: position.left, top: position.top, zIndex, opacity: position.maxHeight ? 1 : 0 },
        ]}
      >
        {children(position.maxHeight)}
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({ layer: { position: 'fixed' as never } });
