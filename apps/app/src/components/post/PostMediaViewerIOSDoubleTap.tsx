import type { ReactElement } from 'react';

export type IOSDoubleTapPoint = Readonly<{ x: number; y: number }>;

export type IOSDoubleTapProps = Readonly<{
  children: ReactElement;
  enabled: boolean;
  onDoubleTap: (point: IOSDoubleTapPoint) => void;
}>;

export function IOSDoubleTap({ children }: IOSDoubleTapProps) {
  return children;
}
