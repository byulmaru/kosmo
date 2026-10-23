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

const tabsDescription =
  '홈에서는 내 글과 팔로우한 프로필의 글을 모아 봐요. 로컬에서는 KOSMO의 공개 글을 둘러봐요. 위 탭에서 전환할 수 있어요.';

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
  lifecycleKey: string;
  mobile: boolean;
  profileName?: string | null;
  tabsAnchorRef: RefObject<NativeView | null>;
}>;

type TimelineShellChrome = NonNullable<ReturnType<typeof useShellChrome>>;

export function TimelineCoachmark(props: TimelineCoachmarkProps) {
  const shellChrome = useShellChrome();
  const profileAnchorRef = shellChrome?.timelineProfileRef;
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
  mobile,
  profileName,
  shellChrome,
  tabsAnchorRef,
  composerAnchorRef,
  profileAnchorRef,
}: TimelineCoachmarkProps & {
  composerAnchorRef?: RefObject<NativeView | null>;
  profileAnchorRef: RefObject<NativeView | null>;
  shellChrome: TimelineShellChrome;
}) {
  const {
    closeNavigationDrawer,
    navigationDrawerOpen,
    openNavigationDrawer,
    registerTimelineHelp,
    timelineHelpTriggerRef,
  } = shellChrome;
  const [targetReady, setTargetReady] = useState(false);
  let guideOpenedDrawer = false;

  const openGuideDrawer = () => {
    if (mobile && !navigationDrawerOpen) {
      guideOpenedDrawer = true;
      openNavigationDrawer();
    }
  };
  const releaseGuideDrawer = () => {
    if (!guideOpenedDrawer) {
      return;
    }

    guideOpenedDrawer = false;
    closeNavigationDrawer?.();
  };
  const onGuideExit = () => {
    releaseGuideDrawer();
  };

  useLayoutEffect(() => {
    setTargetReady(Boolean(tabsAnchorRef.current));
  }, [tabsAnchorRef]);
  const steps = [
    {
      anchorRef: tabsAnchorRef,
      description: tabsDescription,
      onEnter: releaseGuideDrawer,
      title: '홈과 로컬 둘러보기',
    },
    {
      anchorRef: profileAnchorRef,
      description: hasSelectedProfile
        ? `지금은 ‘${profileName ?? '현재 프로필'}’ 프로필로 활동하고 있어요. 여기를 눌러 다른 프로필로 바꿀 수 있어요.`
        : hasProfiles
          ? '활동할 프로필을 선택할 수 있어요.'
          : '여기에서 활동할 프로필을 만들 수 있어요.',
      onEnter: openGuideDrawer,
      title: '지금 활동하는 프로필',
    },
    ...(hasSelectedProfile
      ? [
          {
            anchorRef: composerAnchorRef!,
            description:
              '여기에서 지금 떠오른 생각을 적어 보세요. 글을 쓰지 않아도 안내를 마칠 수 있어요.',
            onEnter: releaseGuideDrawer,
            title: '새 글 쓰기',
          },
        ]
      : []),
  ];
  const controller = useCoachmarkController({
    account,
    guide: 'TIMELINE',
    onExit: onGuideExit,
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
        manualHandle = openCoachmark();
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
