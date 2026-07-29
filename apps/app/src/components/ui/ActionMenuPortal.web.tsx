import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function ActionMenuPortal({ children }: { children: ReactNode }): ReactNode {
  return createPortal(children, document.body);
}
