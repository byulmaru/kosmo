export type ZoomAccessibilityActionName =
  | 'increment'
  | 'decrement'
  | 'reset'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown';

export type ZoomAccessibilityProps = Readonly<{
  accessibilityActions: readonly {
    label?: string;
    name: ZoomAccessibilityActionName;
  }[];
  accessibilityValue: Readonly<{ max: number; min: number; now: number; text: string }>;
  onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => void;
}>;

export type ZoomAccessibilityState = Readonly<{
  canPanDown: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  canPanUp: boolean;
  scale: number;
}>;

export function getZoomAccessibilityProps(
  state: ZoomAccessibilityState,
  onAccessibilityAction: ZoomAccessibilityProps['onAccessibilityAction'],
): ZoomAccessibilityProps {
  const scale = Math.max(1, Math.min(4, state.scale));
  const actions: ZoomAccessibilityProps['accessibilityActions'][number][] = [];
  if (scale < 4) {
    actions.push({ label: '확대', name: 'increment' });
  }
  if (scale > 1) {
    actions.push({ label: '축소', name: 'decrement' });
    actions.push({ label: '화면 맞춤', name: 'reset' });
  }
  if (scale > 1 && state.canPanLeft) {
    actions.push({ label: '왼쪽 영역 보기', name: 'panLeft' });
  }
  if (scale > 1 && state.canPanRight) {
    actions.push({ label: '오른쪽 영역 보기', name: 'panRight' });
  }
  if (scale > 1 && state.canPanUp) {
    actions.push({ label: '위쪽 영역 보기', name: 'panUp' });
  }
  if (scale > 1 && state.canPanDown) {
    actions.push({ label: '아래쪽 영역 보기', name: 'panDown' });
  }
  const displayScale = Number.isInteger(scale) ? String(scale) : scale.toFixed(1);
  return {
    accessibilityActions: actions,
    accessibilityValue: { max: 4, min: 1, now: scale, text: `${displayScale}배` },
    onAccessibilityAction,
  };
}

export type ZoomAccessibilityChildProps = Readonly<{
  zoomAccessibility?: ZoomAccessibilityProps;
}>;
