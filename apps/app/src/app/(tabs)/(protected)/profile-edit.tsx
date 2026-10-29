import { useRouter } from 'expo-router';
import { ProfileEditHeader } from '@/components/profile/ProfileEditHeader';
import { ProfileEditRoute } from '@/components/profile/ProfileEditRoute';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';

export default function ProfileEditPage() {
  const router = useRouter();
  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  return (
    <RouteBoundary
      error={(resetErrorBoundary) => (
        <>
          <ProfileEditHeader onBack={onBack} />
          <StateView
            actionLabel="다시 시도"
            alert
            description="잠시 후 다시 시도해주세요."
            onAction={resetErrorBoundary}
            title="프로필 편집 정보를 불러오지 못했어요"
          />
        </>
      )}
      loading={
        <>
          <ProfileEditHeader onBack={onBack} />
          <StateView loading title="프로필 편집 정보를 불러오는 중입니다." />
        </>
      }
      title="프로필 편집 정보를 불러오지 못했어요"
    >
      <ProfileEditRouteContent />
    </RouteBoundary>
  );
}

function ProfileEditRouteContent() {
  const { fetchKey } = useRouteBoundary();
  return <ProfileEditRoute fetchKey={fetchKey} />;
}
