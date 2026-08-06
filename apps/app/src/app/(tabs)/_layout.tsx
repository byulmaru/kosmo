import { UniversalShell } from '@/components/shell/UniversalShell';
import { RelayActorBoundary } from '@/relay/RelayActorProvider';

export default function TabsLayout() {
  return (
    <RelayActorBoundary>
      <UniversalShell />
    </RelayActorBoundary>
  );
}
