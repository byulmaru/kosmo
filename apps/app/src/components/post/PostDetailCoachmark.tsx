import { useFocusEffect } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useEffectEvent, useRef, useState } from 'react';
import { useCoachmarkController } from '@/components/coachmark/CoachmarkController';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { createPostDetailCoachmarkSteps } from './PostDetailCoachmarkSteps';
import type { View as NativeView } from 'react-native';
import type { CoachmarkController_account$key } from '@/components/coachmark/CoachmarkController';
import type { CoachmarkRequestHandle } from '@/components/coachmark/CoachmarkProvider';
import type { PostDetailCoachmarkTargets } from './PostDetailCoachmarkSteps';

type Props = Readonly<{
  account: CoachmarkController_account$key | null | undefined;
  ready: boolean;
  summaryAvailable: boolean;
  targets: PostDetailCoachmarkTargets;
}>;

export function PostDetailCoachmark({ account, ready, summaryAvailable, targets }: Props) {
  const theme = useTheme();
  const helpTriggerRef = useRef<NativeView>(null);
  const getSteps = useCallback(() => createPostDetailCoachmarkSteps(targets), [targets]);
  const controller = useCoachmarkController({
    account,
    guide: 'POST',
    preferredFocusRef: helpTriggerRef,
    ready,
    steps: getSteps,
  });
  const [manualHandle, setManualHandle] = useState<CoachmarkRequestHandle | null>(null);
  const requestAutoStart = useEffectEvent(() => controller.requestAutoStart());
  const getManualHandle = useEffectEvent(() => manualHandle);
  const openHelp = useCallback(() => {
    const nextHandle = controller.open();
    if (nextHandle) {
      setManualHandle(nextHandle);
    }
  }, [controller.open]);

  useFocusEffect(
    useCallback(() => {
      const automaticHandle = requestAutoStart();

      return () => {
        automaticHandle?.cancel();
        getManualHandle()?.cancel();
      };
    }, [ready, summaryAvailable]),
  );

  return (
    <IconButton
      accessibilityLabel="게시글 도움말"
      controlRef={helpTriggerRef}
      onPress={openHelp}
      targetSize={44}
      visualSize={44}
    >
      <CircleHelp color={theme.foregroundPrimary} size={22} strokeWidth={2} />
    </IconButton>
  );
}
