import { Platform } from 'react-native';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { RouteTabList } from '@/components/ui/RouteTabList';
import { Tab } from '@/components/ui/Tabs';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { TabOption } from '@/components/ui/Tabs';

export type TimelineTab = 'home' | 'local' | 'federated';

const options: readonly TabOption<TimelineTab>[] = [
  { label: '홈', value: 'home' },
  { label: '로컬', value: 'local' },
  { label: '연합', value: 'federated' },
];

export function TimelineTabs({
  homeAnchorRef,
  localAnchorRef,
  value,
}: {
  homeAnchorRef?: RefObject<NativeView | null>;
  localAnchorRef?: RefObject<NativeView | null>;
  value: TimelineTab;
}) {
  const federatedTimelineEnabled = useFeatureFlag('federated-timeline');
  const shellChrome = useShellChrome();
  return (
    <RouteTabList
      accessibilityLabel="타임라인"
      href={(nextValue) =>
        nextValue === 'home' ? '/home' : nextValue === 'local' ? '/local' : '/federated'
      }
      onReselect={() => {
        if (Platform.OS === 'web') {
          window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
        } else {
          shellChrome?.reselectTab?.('home');
        }
        shellChrome?.reselectHome();
      }}
      param="timeline"
      value={value}
      variant="underline"
      webAction="replace"
    >
      {options
        .filter((option) => option.value !== 'federated' || federatedTimelineEnabled)
        .map((option) => (
          <Tab
            anchorRef={
              option.value === 'home'
                ? homeAnchorRef
                : option.value === 'local'
                  ? localAnchorRef
                  : undefined
            }
            key={option.value}
            option={option}
          />
        ))}
    </RouteTabList>
  );
}
