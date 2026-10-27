import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { NavigationDrawerTrigger } from '@/components/shell/NavigationDrawerTrigger';
import { getShellLayout } from '@/components/shell/shellLayout';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';

export default function SettingsRoute() {
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  const content =
    layout === 'full' ? (
      <>
        <PageHeader title="프로필 설정" />
        <SettingsProfileDetail />
      </>
    ) : (
      <>
        <MobileWebRouteChrome>
          <PageHeader
            leading={web && layout === 'mobile' ? <NavigationDrawerTrigger /> : undefined}
            title="설정"
          />
        </MobileWebRouteChrome>
        <SettingsNavigationList />
      </>
    );

  return (
    <RouteScrollContainer
      nativeScrollProps={{
        contentContainerStyle: styles.nativeContent,
        style: styles.nativeRoot,
      }}
      webStyle={styles.webRoot}
    >
      {content}
    </RouteScrollContainer>
  );
}

const styles = StyleSheet.create({
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
});
