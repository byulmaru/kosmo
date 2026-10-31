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
  gap = spacing.sm,
  maxWidth,
  maxHeight = 430,
  placement,
  horizontalPlacement = 'start',
  verticalPlacement = 'after',
}: DropdownProps) {
  // Geometry and event containment require the actual platform elements.
  const contentRef = useRef<View>(null);
  const [position, setPosition] = useState<{
    left: number;
    maxHeight: number;
    maxWidth: number;
    placement: 'bottom' | 'top';
    top: number;
  }>({
    left: 0,
    top: 0,
    maxHeight,
    maxWidth: maxWidth ?? minWidth,
    placement: 'bottom',
  });
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
      const contentBounds = content?.getBoundingClientRect();
      const width = contentBounds?.width || minWidth;
      const height = contentBounds?.height || 0;
      const insets =
        typeof viewportInset === 'number'
          ? {
              bottom: viewportInset,
              left: viewportInset,
              right: viewportInset,
              top: viewportInset,
            }
          : {
              bottom: viewportInset.bottom ?? 0,
              left: viewportInset.left ?? 0,
              right: viewportInset.right ?? 0,
              top: viewportInset.top ?? 0,
            };
      const availableWidth = Math.max(0, rightEdge - leftEdge - insets.left - insets.right);
      const contentWidth = Math.min(maxWidth ?? width, availableWidth);
      const availableHeight = Math.max(0, bottomEdge - topEdge - insets.top - insets.bottom);
      const desiredHeight = Math.min(maxHeight, availableHeight);
      const below = Math.max(0, bottomEdge - insets.bottom - rect.bottom - gap);
      const above = Math.max(0, rect.top - topEdge - insets.top - gap);
      const autoBottom = below >= desiredHeight || below >= above;
      const autoPlacement = autoBottom ? 'bottom' : 'top';
      const availablePlacementHeight = Math.min(
        desiredHeight,
        verticalPlacement === 'auto' ? (autoBottom ? below : above) : availableHeight,
      );
      const anchoredLeft =
        placement === 'overlap-end'
          ? rect.right - contentWidth
          : horizontalPlacement === 'after'
            ? rect.right + gap
            : horizontalPlacement === 'end'
              ? rect.right + anchorInset - contentWidth
              : rect.left - anchorInset;
      const anchoredTop =
        placement === 'overlap-end'
          ? rect.top + height > bottomEdge
            ? rect.bottom - height
            : rect.top
          : verticalPlacement === 'auto'
            ? autoBottom
              ? rect.bottom + gap
              : rect.top -
                gap -
                Math.min(height || availablePlacementHeight, availablePlacementHeight)
            : verticalPlacement === 'after'
              ? rect.bottom + gap
              : verticalPlacement === 'end'
                ? rect.bottom - height
                : rect.top - anchorInset;
      const selectedPlacement =
        verticalPlacement === 'auto'
          ? autoPlacement
          : verticalPlacement === 'after'
            ? 'bottom'
            : 'top';
      const contentHeight = Math.min(height || availablePlacementHeight, availablePlacementHeight);
      const topEdgeWithInset = topEdge + insets.top;
      const bottomEdgeWithInset = bottomEdge - insets.bottom;
      const top = Math.max(
        topEdgeWithInset,
        Math.min(anchoredTop, bottomEdgeWithInset - contentHeight),
      );
      const nextMaxHeight =
        verticalPlacement === 'auto'
          ? availablePlacementHeight
          : Math.max(0, Math.min(maxHeight, bottomEdgeWithInset - top));
      const next = {
        left: Math.max(
          leftEdge + insets.left,
          Math.min(anchoredLeft, rightEdge - insets.right - contentWidth),
        ),
        top,
        maxHeight: nextMaxHeight,
        maxWidth: Math.max(0, contentWidth),
        placement: selectedPlacement === 'bottom' ? ('bottom' as const) : ('top' as const),
      };
      setPosition((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight &&
        current.maxWidth === next.maxWidth &&
        current.placement === next.placement
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
    gap,
    horizontalPlacement,
    maxHeight,
    maxWidth,
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
        {...{
          dataSet: {
            dropdownOpen: active ? 'true' : undefined,
            placement: position.placement,
          },
        }}
        testID={testID}
        style={[
          styles.layer,
          {
            left: position.left,
            maxWidth: maxWidth === undefined ? undefined : position.maxWidth,
            top: position.top,
            width: maxWidth === undefined ? undefined : position.maxWidth,
            zIndex,
            opacity: position.maxHeight ? 1 : 0,
          },
        ]}
      >
        {children(position.maxHeight)}
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({ layer: { position: 'fixed' as never } });
