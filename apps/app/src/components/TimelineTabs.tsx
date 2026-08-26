import { useRouter } from 'expo-router';
import { Tab, TabList } from '@/components/ui/Tabs';
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
  const router = useRouter();

  return (
    <TabList
      accessibilityLabel="타임라인"
      onValueChange={(nextValue) => {
        if (nextValue === value) {
          onReselect?.();
          return;
        }

        router.replace(nextValue === 'home' ? '/home' : '/local');
      }}
      value={value}
      variant="underline"
    >
      {options.map((option) => (
        <Tab key={option.value} option={option} />
      ))}
    </TabList>
  );
}
