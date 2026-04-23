import { Link } from 'expo-router';
import { BellIcon, HouseIcon, MenuIcon, SearchIcon, SquarePenIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  state: {
    index: number;
    routes: {
      name: string;
    }[];
  };
};

type BottomTabItem = {
  key: string;
  routeName: string;
  title: string;
  icon: LucideIcon;
  href: Href;
};

const BOTTOM_TAB_ITEMS: BottomTabItem[] = [
  {
    key: 'home',
    routeName: 'index',
    title: '홈',
    icon: HouseIcon,
    href: '/(tabs)',
  },
  { key: 'search', routeName: 'search', title: '검색', icon: SearchIcon, href: '/(tabs)/search' },
  {
    key: 'compose',
    routeName: 'compose',
    title: '글쓰기',
    icon: SquarePenIcon,
    href: '/(tabs)/compose',
  },
  {
    key: 'notifications',
    routeName: 'notifications',
    title: '알림',
    icon: BellIcon,
    href: '/(tabs)/notifications',
  },
  { key: 'menu', routeName: 'menu', title: '메뉴', icon: MenuIcon, href: '/(tabs)/menu' },
] as const;

const tabButtonVariants = tv({
  base: 'flex-1 items-center justify-center pb-safe',
  variants: {
    isFocused: {
      true: 'bg-primary',
      false: 'bg-transparent',
    },
  },
});

const tabIconVariants = tv({
  variants: {
    isFocused: {
      true: 'text-primary-foreground',
      false: 'text-muted-foreground',
    },
  },
});

const tabTextVariants = tv({
  base: 'font-semibold',
  variants: {
    intent: {
      icon: 'text-base',
      label: 'text-sm',
    },
    isFocused: {
      true: 'text-primary-foreground',
      false: 'text-muted-foreground',
    },
  },
});

export function BottomTabBar({ state }: Props) {
  return (
    <View className="bg-card border-border flex-row border-t">
      {BOTTOM_TAB_ITEMS.map((item) => {
        const routeIndex = state.routes.findIndex((route) => route.name === item.routeName);
        const isFocused = routeIndex >= 0 && state.index === routeIndex;

        return (
          <Link key={item.key} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              className={tabButtonVariants({ isFocused })}
            >
              <View className="items-center justify-center py-2">
                <item.icon size={24} strokeWidth={2} className={tabIconVariants({ isFocused })} />
                <Text className={tabTextVariants({ intent: 'label', isFocused })}>
                  {item.title}
                </Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
