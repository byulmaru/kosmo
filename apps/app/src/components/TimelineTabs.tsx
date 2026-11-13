import { Platform } from 'react-native';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { RouteTabList } from '@/components/ui/RouteTabList';
import { Tab } from '@/components/ui/Tabs';
import type { TabOption } from '@/components/ui/Tabs';

export type TimelineTab = 'home' | 'local' | 'federated';

const options: readonly TabOption<TimelineTab>[] = [
  { label: '홈', value: 'home' },
  { label: '로컬', value: 'local' },
  { label: '연합', value: 'federated' },
];

export function TimelineTabs({ value }: { value: TimelineTab }) {
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
      {options.map((option) => (
        <Tab key={option.value} option={option} />
      ))}
    </RouteTabList>
  );
}
