import { useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { PageHeaderView } from './PageHeaderView';
import { NavigationDrawerTrigger } from './shell/NavigationDrawerTrigger';
import type { PageHeaderProps } from './PageHeaderView';

export function PageHeader(props: PageHeaderProps) {
  const navigation = useNavigation();
  const headerProps =
    'children' in props || props.leading
      ? props
      : { ...props, leading: <NavigationDrawerTrigger /> };

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <NativePageHeader {...headerProps} />,
      headerShown: true,
    });

    return () => navigation.setOptions({ header: undefined, headerShown: false });
  }, [headerProps, navigation]);

  return null;
}

function NativePageHeader(props: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.backgroundCanvas, paddingTop: insets.top }}>
      <PageHeaderView {...props} />
    </View>
  );
}
