import { useCallback } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { RepostActionFailure, RepostActionKind } from './RepostAction';

const messages: Record<RepostActionKind, string> = {
  create: '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  cancel: '재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export function useRepostFailureToast() {
  const { showToast } = useToast();
  return useCallback(({ action }: RepostActionFailure) => showToast(messages[action]), [showToast]);
}
