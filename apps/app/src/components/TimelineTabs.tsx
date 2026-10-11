import { RouteTabList } from '@/components/ui/RouteTabList';
import { Tab } from '@/components/ui/Tabs';
import type { TabOption } from '@/components/ui/Tabs';

export type TimelineTab = 'home' | 'local';

const options: readonly TabOption<TimelineTab>[] = [
  { label: '홈', value: 'home' },
  { label: '로컬', value: 'local' },
];

export function TimelineTabs({
  onReselect,
  value,
}: {
  onReselect?: () => void;
  value: TimelineTab;
}) {
  return (
    <RouteTabList
      accessibilityLabel="타임라인"
      href={(nextValue) => (nextValue === 'home' ? '/home' : '/local')}
      onReselect={onReselect}
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
