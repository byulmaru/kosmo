import { UniversalShell } from '@/components/shell/UniversalShell';
import { UnreadNotificationBadgeController } from '@/components/shell/UnreadNotificationBadgeController';
import { RelayActorBoundary } from '@/relay/RelayActorProvider';

export default function TabsLayout() {
  return (
    <UnreadNotificationBadgeController>
      <RelayActorBoundary>
        <UniversalShell />
      </RelayActorBoundary>
    </UnreadNotificationBadgeController>
  );
}
