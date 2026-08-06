import { ProfileEditRoute } from '@/components/profile/ProfileEditRoute';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';

export default function ProfileEditPage() {
  return (
    <RouteBoundary
      loading={<StateView loading title="프로필 편집 정보를 불러오는 중입니다." />}
      title="프로필 편집 정보를 불러오지 못했어요"
    >
      <ProfileEditRoute />
    </RouteBoundary>
  );
}
