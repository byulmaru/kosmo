import { Platform } from 'react-native';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { RouteTabList } from '@/components/ui/RouteTabList';
import { Tab } from '@/components/ui/Tabs';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { TabOption } from '@/components/ui/Tabs';

export type TimelineTab = 'home' | 'local';

const options: readonly TabOption<TimelineTab>[] = [
  { label: '홈', value: 'home' },
  { label: '로컬', value: 'local' },
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
  const shellChrome = useShellChrome();
  return (
    <RouteTabList
      accessibilityLabel="타임라인"
      href={(nextValue) => (nextValue === 'home' ? '/home' : '/local')}
      onReselect={() => {
        if (Platform.OS === 'web') {
          window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
        } else {
          shellChrome?.reselectTab?.('home');
        }
      }}
      param="timeline"
      value={value}
      variant="underline"
      webAction="replace"
    >
      {options.map((option) => (
        <Tab
          anchorRef={option.value === 'home' ? homeAnchorRef : localAnchorRef}
          key={option.value}
          option={option}
        />
      ))}
    </RouteTabList>
  );
}
