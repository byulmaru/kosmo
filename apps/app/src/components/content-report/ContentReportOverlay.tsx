import { FormOverlay } from '@/components/ui/FormOverlay';
import { useToast } from '@/components/ui/ToastProvider';
import { spacing } from '@/theme/tokens';
import { ContentReportForm } from './ContentReportForm';
import type { ContentReportTarget } from './ContentReportContext';

type Props = {
  onRequestClose: () => void;
  target: ContentReportTarget | null;
  visible: boolean;
};

export function ContentReportOverlay({ onRequestClose, target, visible }: Props) {
  const { showToast } = useToast();

  if (!target) {
    return null;
  }

  const title = target.kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';

  return (
    <FormOverlay
      bodyPadding={spacing.lg}
      continueEditingFocusSelector='textarea, [role="radio"]'
      discardConfirmLabel="신고 버리기"
      discardTitle="작성 중인 신고를 버릴까요?"
      fallbackFocusSelector='[data-content-report-focus-fallback], [data-testid="universal-shell-root"]'
      limitNativeHeight
      onRequestClose={onRequestClose}
      renderForm={({ close, onStateChange }) => (
        <ContentReportForm
          onDelivered={() => {
            close();
            showToast('신고를 전달했습니다.', { tone: 'success' });
          }}
          onStateChange={onStateChange}
          target={target}
        />
      )}
      testIDPrefix="content-report"
      title={title}
      visible={visible}
    />
  );
}
