import { useFocusEffect } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useShellChrome } from '../shell/ShellChromeContext';
import { useCoachmarkController } from './CoachmarkController';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { CoachmarkController_account$key } from './CoachmarkController';
import type { CoachmarkRequestHandle } from './CoachmarkProvider';

const homeDescription = '내 글과 팔로우한 프로필의 글을 모아 봐요.';
const localDescription =
  '아직 누구를 팔로우할지 모르겠다면 로컬을 둘러보세요. 팔로우하지 않은 사람을 포함해, 코스모 사람들이 전체 공개로 올린 글을 볼 수 있어요.';

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
  const {
    closeNavigationDrawer,
    navigationDrawerOpen,
    openNavigationDrawer,
    registerTimelineHelp,
    timelineHelpTriggerRef,
  } = shellChrome;
  const [targetReady, setTargetReady] = useState(false);
  const guideOwnsDrawerRef = useRef(false);

  const openGuideDrawer = useEffectEvent(() => {
    if (mobile && !navigationDrawerOpen && !guideOwnsDrawerRef.current) {
      guideOwnsDrawerRef.current = true;
      openNavigationDrawer();
    }
  });
  const releaseGuideDrawer = useEffectEvent(() => {
    if (!guideOwnsDrawerRef.current) {
      return;
    }

    guideOwnsDrawerRef.current = false;
    closeNavigationDrawer?.();
  });
  const onGuideExit = useEffectEvent(() => releaseGuideDrawer());

  useLayoutEffect(() => {
    setTargetReady(Boolean(homeTabAnchorRef.current && localTabAnchorRef.current));
  }, [homeTabAnchorRef, localTabAnchorRef]);
  const steps = [
    {
      anchorRef: homeTabAnchorRef,
      description: homeDescription,
      onEnter: releaseGuideDrawer,
      title: '내가 팔로우한 사람들의 글',
    },
    {
      anchorRef: localTabAnchorRef,
      description: localDescription,
      onEnter: releaseGuideDrawer,
      title: '코스모 사람들의 글을 둘러보세요',
    },
    {
      anchorRef: profileAnchorRef,
      description: hasSelectedProfile
        ? `지금은 ‘${profileName ?? '현재 프로필'}’로 활동하고 있어요. 여기에서 다른 프로필로 바꿀 수 있어요.`
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
              '여기에서 새 글을 쓸 수 있어요. 공개 범위와 첨부 방법은 작성 화면에서 안내해 드릴게요.',
            onEnter: releaseGuideDrawer,
            title: '내 이야기도 남겨보세요',
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
