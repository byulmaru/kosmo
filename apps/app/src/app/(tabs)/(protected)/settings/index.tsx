import { PageHeader } from '@/components/PageHeader';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';

export default function SettingsRoute() {
  return (
    <>
      <PageHeader title="게시물 기본 공개 범위" />
      <SettingsProfileDetail />
    </>
  );
}
