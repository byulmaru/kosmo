import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { SettingsPageQuery } from './__generated__/SettingsPageQuery.graphql';

const SettingsQuery = graphql`
  query SettingsPageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...SettingsPage_profile
      }
    }
  }
`;

export default function SettingsScreen() {
  const { revision } = useRelayActor();

  return <SettingsRoute key={revision} revision={revision} />;
}

function SettingsRoute({ revision }: { revision: number }) {
  const [fetchKey, setFetchKey] = useState(0);
  const identity = `${revision}:${fetchKey}`;

  return (
    <RouteBoundary
      error={(retry) => (
        <StateView
          actionLabel="다시 시도"
          alert
          description="잠시 후 다시 시도해주세요."
          onAction={retry}
          title="설정 정보를 불러오지 못했어요"
        />
      )}
      loading={<StateView loading title="설정 정보를 불러오는 중입니다." />}
      onRetry={() => setFetchKey((current) => current + 1)}
      title="설정 정보를 불러오지 못했어요"
    >
      <SettingsRouteContent fetchKey={identity} />
    </RouteBoundary>
  );
}

function SettingsRouteContent({ fetchKey }: { fetchKey: string }) {
  const data = useLazyLoadQuery<SettingsPageQuery>(
    SettingsQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return <SettingsPage profile={data.currentSession?.selectedProfile ?? null} />;
}
