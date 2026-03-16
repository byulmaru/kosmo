import { Drawer } from 'expo-router/drawer';
import { useWindowDimensions } from 'react-native';
import DrawerContent from '@/components/menu/DrawerContent';

const SM_BREAKPOINT = 640;

export default function MainLayout() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= SM_BREAKPOINT;

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isLargeScreen ? 'permanent' : 'front',
        drawerStyle: {
          width: isLargeScreen ? 240 : 280,
          borderRightWidth: 1,
          borderRightColor: '#e5e7eb',
        },
      }}
    />
  );
}
