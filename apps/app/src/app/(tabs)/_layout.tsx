import { UniversalShell } from '@/components/shell/UniversalShell';
import { UnreadNotificationBadgeController } from '@/components/shell/UnreadNotificationBadgeController';

export default function TabsLayout() {
  return (
    <UnreadNotificationBadgeController>
      <UniversalShell />
    </UnreadNotificationBadgeController>
  );
}
