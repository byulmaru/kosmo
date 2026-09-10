import { useEffect, useRef } from 'react';
import { Modal } from 'react-native';
import type { ModalSheetHostProps } from './ModalSheetHost';

export function ModalSheetHost({ closeRequestDisabled, ...props }: ModalSheetHostProps) {
  // React Native Web's Modal always overwrites role with dialog. Keep its existing dialog path.
  return props.role === 'alertdialog' ? (
    <AlertDialog closeRequestDisabled={closeRequestDisabled} {...props} />
  ) : (
    <Modal {...props} />
  );
}

function AlertDialog({
  accessibilityLabel,
  children,
  closeRequestDisabled,
  onRequestClose,
  onShow,
  visible,
}: ModalSheetHostProps) {
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
    }
  }, [onShow, visible]);
  return (
    <dialog
      aria-label={accessibilityLabel}
      aria-modal="true"
      closedby={closeRequestDisabled ? 'none' : 'closerequest'}
      data-kosmo-modal-sheet
      ref={ref}
      role="alertdialog"
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
        width: '100%',
      }}
    >
      <style>{'[data-kosmo-modal-sheet]::backdrop { background: transparent; }'}</style>
      <div style={{ display: 'flex', minHeight: '100%', width: '100%' }}>{children}</div>
    </dialog>
  );
}
