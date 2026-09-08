import { Pin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { ReactNode } from 'react';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';

export type ProfilePinOperation = 'pin' | 'unpin';
export type ProfilePinControl = {
  postId: string;
  action: ProfilePinOperation;
  onAction: (action: ProfilePinOperation) => Promise<void>;
};

export type ProfilePinMenuAction = {
  item: ActionMenuItem;
  pending: boolean;
  onTriggerReady: (focus: () => void) => void;
};

type Props = ProfilePinControl & {
  children: (action: ProfilePinMenuAction) => ReactNode;
};

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
    if (inFlight.current) {
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
  return props.children({
    item: {
      key: 'pin',
      icon: Pin,
      label: props.action === 'unpin' ? '프로필 고정 해제' : '프로필에 고정',
      onSelect: () => void request(),
    },
    pending,
    onTriggerReady: (focus) => {
      focusTrigger.current = focus;
    },
  });
}
