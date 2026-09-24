import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { getShellLayout } from '@/components/shell/shellLayout';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';

export default function SettingsRoute() {
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  if (layout !== 'full') {
    const content = (
      <>
        {!web || layout !== 'mobile' ? <PageHeader title="설정" /> : null}
        <SettingsNavigationList />
      </>
    );

    return web ? (
      content
    ) : (
      <RouteScrollContainer
        nativeScrollProps={{
          contentContainerStyle: styles.nativeContent,
          style: styles.nativeRoot,
        }}
      >
        {content}
      </RouteScrollContainer>
    );
  }

  return (
    <>
      <PageHeader title="게시물 기본 공개 범위" />
      <SettingsProfileDetail />
    </>
  );
}

const styles = StyleSheet.create({
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
});
