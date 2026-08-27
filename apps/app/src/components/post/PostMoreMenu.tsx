import { Link2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { setStringAsync } from '@/components/post/postClipboard';
import { useToast } from '@/components/ui/ToastProvider';
import { getPublicWebOrigin } from '@/config/origin';
import { createPostShareReference } from './postShareReference';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

type Props = Readonly<{
  postId: string;
  relativeHandle: string;
}>;

const copyFailureMessage = '링크를 복사하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function usePostMoreMenuItem({ postId, relativeHandle }: Props): ActionMenuItem {
  const { showToast } = useToast();
  const copyReference = useCallback(async () => {
    try {
      const reference = createPostShareReference(getPublicWebOrigin(), relativeHandle, postId);
      const copied = await setStringAsync(reference);
      if (!copied) {
        throw new Error('Clipboard did not confirm the copy.');
      }
    } catch {
      showToast(copyFailureMessage);
    }
  }, [postId, relativeHandle, showToast]);

  return {
    accessibilityLabel: '링크 복사',
    icon: Link2,
    key: 'copy-link',
    label: '링크 복사',
    onSelect: () => void copyReference(),
  };
}
