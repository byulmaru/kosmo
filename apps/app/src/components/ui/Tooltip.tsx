import type { ReactElement } from 'react';

export type TooltipProps = {
  label: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
};

export function Tooltip({ children }: TooltipProps) {
  return children;
}
