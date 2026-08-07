import { Platform, useWindowDimensions } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsOnePane, SettingsWorkspace } from '@/components/settings/SettingsLayout';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { getShellLayout } from '@/components/shell/shellLayout';

export default function SettingsRoute() {
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  if (layout === 'full') {
    return (
      <SettingsWorkspace
        detail={
          <>
            <PageHeader title="게시물 기본 공개 범위" />
            <SettingsProfileDetail />
          </>
        }
        master={
          <>
            <PageHeader title="설정" />
            <SettingsNavigationList selected="default-post-visibility" />
          </>
        }
      />
    );
  }

  return (
    <SettingsOnePane>
      {!web || layout !== 'mobile' ? <PageHeader title="설정" /> : null}
      <SettingsNavigationList />
    </SettingsOnePane>
  );
}
