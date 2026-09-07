import { Modal } from 'react-native';
import type { ModalProps } from 'react-native';

export type ModalSheetHostProps = Omit<ModalProps, 'onRequestClose' | 'onShow'> & {
  onRequestClose?: () => void;
  onShow?: () => void;
  role?: 'dialog' | 'alertdialog';
};

export function ModalSheetHost(props: ModalSheetHostProps) {
  return <Modal {...props} />;
}
