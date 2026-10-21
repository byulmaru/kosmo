import { Link2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { trackAnalytics } from '@/analytics/client';
import { setStringAsync } from '@/components/post/postClipboard';
import { useToast } from '@/components/ui/ToastProvider';
import { getPublicWebOrigin } from '@/config/origin';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { createPostShareReference } from './postShareReference';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

type Props = Readonly<{
  postId: string;
  relativeHandle: string;
}>;

const copyFailureMessage = '링크를 복사하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const copySuccessMessage = '링크를 복사했어요';

export function usePostMoreMenuItem({ postId, relativeHandle }: Props): ActionMenuItem {
  const { showToast } = useToast();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const copyReference = useCallback(async () => {
    const requestGeneration = environmentGenerationRef?.current;
    try {
      const reference = createPostShareReference(getPublicWebOrigin(), relativeHandle, postId);
      const copied = await setStringAsync(reference);
      if (!copied) {
        throw new Error('Clipboard did not confirm the copy.');
      }
      if (environmentGenerationRef?.current === requestGeneration) {
        trackAnalytics('link_copied', { target: 'post' });
      }
      showToast(copySuccessMessage, { tone: 'success' });
    } catch {
      showToast(copyFailureMessage, { tone: 'danger' });
    }
  }, [environmentGenerationRef, postId, relativeHandle, showToast]);

  return {
    accessibilityLabel: '링크 복사',
    icon: Link2,
    key: 'copy-link',
    label: '링크 복사',
    onSelect: () => void copyReference(),
  };
}
