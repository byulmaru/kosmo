import { Platform, useWindowDimensions } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { NavigationDrawerTrigger } from '@/components/shell/NavigationDrawerTrigger';
import { getShellLayout } from '@/components/shell/shellLayout';
import { NotificationReadAllAction } from './NotificationReadAllContext';
import type { PropsWithChildren } from 'react';

export function NotificationRouteFrame({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const mobileWeb = Platform.OS === 'web' && getShellLayout(true, width) === 'mobile';

  return (
    <>
      <MobileWebRouteChrome>
        <PageHeader
          leading={mobileWeb ? <NavigationDrawerTrigger /> : undefined}
          title="알림"
          trailing={<NotificationReadAllAction />}
        />
      </MobileWebRouteChrome>
      {children}
    </>
  );
}
