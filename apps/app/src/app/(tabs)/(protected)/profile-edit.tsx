import { useState } from 'react';
import { ProfileEditRoute } from '@/components/profile/ProfileEditRoute';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';

export default function ProfileEditPage() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const identity = `${revision}:${fetchKey}`;

  return (
    <RouteBoundary
      key={identity}
      loading={<StateView loading title="프로필 편집 정보를 불러오는 중입니다." />}
      onRetry={() => setFetchKey((current) => current + 1)}
      title="프로필 편집 정보를 불러오지 못했어요"
    >
      <ProfileEditRoute fetchKey={identity} />
    </RouteBoundary>
  );
}
