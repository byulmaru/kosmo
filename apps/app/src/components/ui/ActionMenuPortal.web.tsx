import { OverlayPortal } from '@/components/ui/OverlayPortal';
import type { ReactNode } from 'react';

export function ActionMenuPortal({ children }: { children: ReactNode }): ReactNode {
  return <OverlayPortal>{children}</OverlayPortal>;
}
