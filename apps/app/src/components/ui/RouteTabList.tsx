import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { TabList } from '@/components/ui/Tabs';
import type { Href } from 'expo-router';
import type { TabListProps } from '@/components/ui/Tabs';

export type RouteTabListProps<Value extends string> = Omit<TabListProps<Value>, 'onValueChange'> & {
  href: (value: Value) => Href;
  onReselect?: () => void;
  onValueChange?: (value: Value) => void;
  param: string;
  webAction: 'push' | 'replace';
};

export function RouteTabList<Value extends string>({
  href,
  onReselect,
  onValueChange,
  param,
  value,
  webAction,
  ...props
}: RouteTabListProps<Value>) {
  const router = useRouter();

  return (
    <TabList
      {...props}
      onValueChange={(nextValue) => {
        if (nextValue === value) {
          onReselect?.();
          return;
        }

        onValueChange?.(nextValue);
        if (Platform.OS === 'web') {
          router[webAction](href(nextValue));
        } else {
          router.setParams({ [param]: nextValue });
        }
      }}
      value={value}
    />
  );
}
