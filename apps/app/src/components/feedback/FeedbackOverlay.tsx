import { FormOverlay } from '@/components/ui/FormOverlay';
import { FeedbackForm } from './FeedbackForm';
import type { RefObject } from 'react';
import type { View } from 'react-native';

type Props = {
  fallbackFocusRef?: RefObject<View | null>;
  onRequestClose: () => void;
  visible: boolean;
};

export function FeedbackOverlay({ fallbackFocusRef, onRequestClose, visible }: Props) {
  return (
    <FormOverlay
      closeAccessibilityLabel="피드백 닫기"
      discardConfirmLabel="피드백 버리기"
      discardTitle="작성 중인 피드백을 버릴까요?"
      fallbackFocusRef={fallbackFocusRef}
      onRequestClose={onRequestClose}
      renderForm={({ onStateChange }) => <FeedbackForm onStateChange={onStateChange} />}
      testIDPrefix="feedback"
      title="피드백 보내기"
      visible={visible}
    />
  );
}
