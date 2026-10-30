import { useFocusEffect } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useEffectEvent, useLayoutEffect, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useShellChrome } from '../shell/ShellChromeContext';
import { useCoachmarkController } from './CoachmarkController';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { CoachmarkController_account$key } from './CoachmarkController';
import type { CoachmarkRequestHandle } from './CoachmarkProvider';

const homeDescription = '내가 쓴 글과 팔로우한 프로필의 글을 모아 볼 수 있어요.';
const localDescription =
  '코스모 사람들이 전체 공개로 올린 글을 볼 수 있어요. 관심 가는 사람을 찾아 팔로우해 보세요.';

type TimelineHelpButtonProps = Readonly<{
  controlRef?: RefObject<NativeView | null>;
  onPress?: () => void;
}>;

export function TimelineHelpButton({ controlRef, onPress }: TimelineHelpButtonProps) {
  const shellChrome = useShellChrome();
  const theme = useTheme();
  const handler = onPress ?? shellChrome?.timelineHelp;
  const ref = controlRef ?? shellChrome?.timelineHelpTriggerRef;

  if (!handler) {
    return null;
  }

  return (
    <IconButton
      accessibilityLabel="타임라인 도움말"
      controlRef={ref}
      onPress={handler}
      targetSize={44}
      visualSize={44}
    >
      <CircleHelp color={theme.foregroundPrimary} size={22} strokeWidth={2} />
    </IconButton>
  );
}

type TimelineCoachmarkProps = Readonly<{
  account: CoachmarkController_account$key | null | undefined;
  hasProfiles: boolean;
  hasSelectedProfile: boolean;
  homeTabAnchorRef: RefObject<NativeView | null>;
  lifecycleKey: string;
  localTabAnchorRef: RefObject<NativeView | null>;
  mobile: boolean;
  profileName?: string | null;
}>;

type TimelineShellChrome = NonNullable<ReturnType<typeof useShellChrome>>;

export function TimelineCoachmark(props: TimelineCoachmarkProps) {
  const shellChrome = useShellChrome();
  const profileAnchorRef = props.mobile
    ? shellChrome?.navigationDrawerTriggerRef
    : shellChrome?.timelineProfileRef;
  const composerAnchorRef = shellChrome?.timelineComposerRef;

  if (!shellChrome || !profileAnchorRef || (props.hasSelectedProfile && !composerAnchorRef)) {
    return null;
  }

  return (
    <TimelineCoachmarkConnected
      {...props}
      composerAnchorRef={composerAnchorRef}
      key={props.lifecycleKey}
      profileAnchorRef={profileAnchorRef}
      shellChrome={shellChrome}
    />
  );
}

function TimelineCoachmarkConnected({
  account,
  hasProfiles,
  hasSelectedProfile,
  homeTabAnchorRef,
  localTabAnchorRef,
  mobile,
  profileName,
  shellChrome,
  composerAnchorRef,
  profileAnchorRef,
}: TimelineCoachmarkProps & {
  composerAnchorRef?: RefObject<NativeView | null>;
  profileAnchorRef: RefObject<NativeView | null>;
  shellChrome: TimelineShellChrome;
}) {
  const { registerTimelineHelp, timelineHelpTriggerRef } = shellChrome;
  const [targetReady, setTargetReady] = useState(false);

  useLayoutEffect(() => {
    setTargetReady(Boolean(homeTabAnchorRef.current && localTabAnchorRef.current));
  }, [homeTabAnchorRef, localTabAnchorRef]);
  const steps = [
    {
      anchorRef: homeTabAnchorRef,
      description: homeDescription,
      title: '팔로우한 사람들의 소식',
    },
    {
      anchorRef: localTabAnchorRef,
      description: localDescription,
      title: '새로운 사람들을 만나보세요',
    },
    {
      anchorRef: profileAnchorRef,
      description: mobile
        ? hasSelectedProfile
          ? `지금은 ‘${profileName ?? '현재 프로필'}’으로 활동하고 있어요. 메뉴를 열면 다른 프로필로 바꿀 수 있어요.`
          : hasProfiles
            ? '메뉴에서 활동할 프로필을 선택할 수 있어요.'
            : '메뉴에서 활동할 프로필을 만들 수 있어요.'
        : hasSelectedProfile
          ? `지금은 ‘${profileName ?? '현재 프로필'}’으로 활동하고 있어요. 다른 프로필로 바꾸고 싶을 때 여기를 눌러 주세요.`
          : hasProfiles
            ? '활동할 프로필을 선택할 수 있어요.'
            : '여기에서 활동할 프로필을 만들 수 있어요.',
      title: '지금 활동 중인 프로필',
    },
    ...(hasSelectedProfile
      ? [
          {
            anchorRef: composerAnchorRef!,
            description: '떠오른 생각이나 나누고 싶은 이야기를 새 글로 남겨 보세요.',
            title: '내 이야기를 들려주세요',
          },
        ]
      : []),
  ];
  const controller = useCoachmarkController({
    account,
    guide: 'TIMELINE',
    preferredFocusRef: timelineHelpTriggerRef,
    ready: targetReady,
    steps,
  });

  const openCoachmark = useEffectEvent(() => controller.open());
  const requestAutoStart = useEffectEvent(() => controller.requestAutoStart());

  useFocusEffect(
    useCallback(() => {
      let manualHandle: CoachmarkRequestHandle | null = null;
      const unregister = registerTimelineHelp?.(() => {
        const nextHandle = openCoachmark();
        if (nextHandle) {
          manualHandle = nextHandle;
        }
      });
      const automaticHandle = targetReady ? requestAutoStart() : null;

      return () => {
        unregister?.();
        manualHandle?.cancel();
        automaticHandle?.cancel();
      };
    }, [registerTimelineHelp, targetReady]),
  );

  return null;
}
