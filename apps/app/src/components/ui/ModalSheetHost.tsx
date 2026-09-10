import { Modal } from 'react-native';
import type { ModalProps } from 'react-native';

export type ModalSheetHostProps = Omit<ModalProps, 'onRequestClose' | 'onShow'> & {
  closeRequestDisabled?: boolean;
  onRequestClose?: () => void;
  onShow?: () => void;
  role?: 'dialog' | 'alertdialog';
};

export function ModalSheetHost({ closeRequestDisabled, ...props }: ModalSheetHostProps) {
  void closeRequestDisabled;
  return <Modal {...props} />;
}
