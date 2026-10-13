import { Modal } from 'react-native';
import type { ModalProps } from 'react-native';

export type ModalSheetHostProps = Omit<ModalProps, 'onRequestClose' | 'onShow'> & {
  closeRequestDisabled?: boolean;
  interactionDisabled: boolean;
  onRequestClose?: () => void;
  onShow?: () => void;
  role?: 'dialog' | 'alertdialog';
};

export function ModalSheetHost({
  closeRequestDisabled,
  interactionDisabled,
  ...props
}: ModalSheetHostProps) {
  void closeRequestDisabled;
  void interactionDisabled;
  return <Modal {...props} />;
}
