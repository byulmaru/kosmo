import { Link2, Pin, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useToast } from '@/components/ui/ToastProvider';
import type { ReactNode } from 'react';
import type { MoreActionConfig } from '@/components/post/PostActionBar';

export type ProfilePinOperation = 'pin' | 'unpin';
type Props = {
  children: (more: MoreActionConfig) => ReactNode;
  onCopyLink: () => void;
  postId: string;
} & (
  | {
      viewer: 'owner';
      action: ProfilePinOperation;
      onAction: (action: ProfilePinOperation) => Promise<void>;
      onDelete?: () => void;
    }
  | {
      viewer: 'visitor';
      action?: never;
      onAction?: never;
      onDelete?: never;
    }
);

/** Eligibility and the result of each request belong to the calling Profile surface. */
export function ProfilePinAction(props: Props) {
  return <ProfilePinActionContent key={props.postId} {...props} />;
}

function ProfilePinActionContent(props: Props) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const focusTrigger = useRef(() => {});
  const restoreTriggerFocus = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      focusTrigger.current();
    }
  }, [pending]);
  const request = async () => {
    if (props.viewer !== 'owner' || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    let succeeded = false;
    try {
      await props.onAction(props.action);
      succeeded = true;
    } catch {
      // Backend errors are not presentation copy.
    }
    if (!mounted.current) {
      return;
    }
    inFlight.current = false;
    restoreTriggerFocus.current = true;
    setPending(false);
    if (!succeeded) {
      showToast('고정 상태를 변경하지 못했어요. 다시 시도해 주세요.', { tone: 'danger' });
    }
  };
  return (
    <ActionMenu
      accessibilityLabel="더 보기 메뉴"
      disabled={pending}
      items={[
        { key: 'copy', icon: Link2, label: '링크 복사', onSelect: props.onCopyLink },
        ...(props.viewer === 'owner'
          ? [
              {
                key: 'pin',
                icon: Pin,
                label: props.action === 'unpin' ? '프로필 고정 해제' : '프로필에 고정',
                onSelect: () => void request(),
              },
            ]
          : []),
        ...(props.viewer === 'owner' && props.onDelete
          ? [
              {
                key: 'delete',
                icon: Trash2,
                label: '삭제',
                tone: 'danger' as const,
                onSelect: props.onDelete,
              },
            ]
          : []),
      ]}
      renderTrigger={({ expanded, focusTrigger: restoreFocus, onPress, ref }) => {
        focusTrigger.current = restoreFocus;
        return props.children({
          accessibilityLabel: '더 보기',
          controlRef: ref,
          menuExpanded: expanded,
          onPress,
          popupRole: 'menu',
          processing: pending ? 'pending' : 'default',
        });
      }}
      sheetIconSize={24}
      webHorizontalPlacement="end"
    />
  );
}
