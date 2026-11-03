import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from 'react-native';
import type { FocusEvent as ReactFocusEvent } from 'react';
import type { ModalSheetHostProps } from './ModalSheetHost';

type VisualViewportBounds = { height: number; offsetTop: number };

function handleViewportFocusCapture(
  event: ReactFocusEvent<HTMLElement>,
  renderedBounds: VisualViewportBounds | null,
) {
  const root = event.currentTarget;
  const target = event.target;
  const ownerWindow = root.ownerDocument.defaultView;
  const viewport = ownerWindow?.visualViewport;
  if (
    !renderedBounds ||
    !ownerWindow ||
    !viewport ||
    !(target instanceof ownerWindow.HTMLElement)
  ) {
    return;
  }
  if (
    Math.abs(renderedBounds.height - viewport.height) <= 1 &&
    Math.abs(renderedBounds.offsetTop - viewport.offsetTop) <= 1
  ) {
    return;
  }

  ownerWindow.requestAnimationFrame(() => {
    if (root.contains(target) && root.ownerDocument.activeElement === target) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
}

function useVisualViewportBounds(visible: boolean) {
  const [bounds, setBounds] = useState<VisualViewportBounds | null>(null);

  useLayoutEffect(() => {
    if (!visible || typeof window === 'undefined') {
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const update = () => {
      const next = { height: viewport.height, offsetTop: viewport.offsetTop };
      setBounds((current) =>
        current?.height === next.height && current.offsetTop === next.offsetTop ? current : next,
      );
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [visible]);

  return visible ? bounds : null;
}

function getVisualViewportStyle(bounds: VisualViewportBounds | null) {
  return bounds
    ? {
        bottom: 'auto' as const,
        height: bounds.height,
        left: 0,
        position: 'fixed' as const,
        right: 0,
        top: bounds.offsetTop,
      }
    : undefined;
}

export function ModalSheetHost({
  closeRequestDisabled,
  interactionDisabled,
  children,
  ...props
}: ModalSheetHostProps) {
  const visible = props.role === 'alertdialog' ? Boolean(props.visible) : (props.visible ?? true);
  const visualViewportBounds = useVisualViewportBounds(visible);
  // React Native Web's Modal always overwrites role with dialog. Keep its existing dialog path.
  return props.role === 'alertdialog' ? (
    <AlertDialog
      closeRequestDisabled={closeRequestDisabled}
      interactionDisabled={interactionDisabled}
      visualViewportBounds={visualViewportBounds}
      {...props}
    >
      {children}
    </AlertDialog>
  ) : (
    <Modal {...props}>
      <div
        inert={interactionDisabled}
        onFocusCapture={(event) => handleViewportFocusCapture(event, visualViewportBounds)}
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          ...getVisualViewportStyle(visualViewportBounds),
        }}
      >
        {children}
      </div>
    </Modal>
  );
}

function AlertDialog({
  accessibilityLabel,
  children,
  closeRequestDisabled,
  interactionDisabled,
  onRequestClose,
  onDismiss,
  onShow,
  visible,
  visualViewportBounds,
}: ModalSheetHostProps & { visualViewportBounds: VisualViewportBounds | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onRequestClose?.();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onRequestClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (visible && !dialog.open) {
      dialog.showModal();
      onShow?.();
    } else if (!visible && dialog.open) {
      dialog.close();
      onDismiss?.();
    }
  }, [onDismiss, onShow, visible]);
  return (
    <dialog
      aria-label={accessibilityLabel}
      aria-modal="true"
      closedby={closeRequestDisabled ? 'none' : 'closerequest'}
      data-kosmo-modal-sheet
      ref={ref}
      role="alertdialog"
      onFocusCapture={(event) => handleViewportFocusCapture(event, visualViewportBounds)}
      style={{
        background: 'transparent',
        border: 0,
        color: 'inherit',
        height: '100%',
        inset: 0,
        margin: 0,
        maxHeight: 'none',
        maxWidth: 'none',
        outline: 'none',
        padding: 0,
        position: 'fixed',
        ...getVisualViewportStyle(visualViewportBounds),
        width: '100%',
      }}
    >
      <style>{'[data-kosmo-modal-sheet]::backdrop { background: transparent; }'}</style>
      <div
        inert={interactionDisabled}
        style={{ display: 'flex', minHeight: '100%', width: '100%' }}
      >
        {children}
      </div>
    </dialog>
  );
}
