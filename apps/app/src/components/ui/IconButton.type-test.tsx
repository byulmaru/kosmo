import { IconButton } from './IconButton';

export function StaticStyleCanInferItsLayoutSize() {
  return (
    <IconButton accessibilityLabel="미디어 추가" style={{ height: 40, width: 40 }}>
      +
    </IconButton>
  );
}

export function FunctionStyleCanUseTargetSize() {
  return (
    <IconButton
      accessibilityLabel="닫기"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      targetSize={40}
    >
      ×
    </IconButton>
  );
}

export function FunctionStyleCanUseVisualSize() {
  return (
    <IconButton
      accessibilityLabel="닫기"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      visualSize={40}
    >
      ×
    </IconButton>
  );
}

export function FunctionStyleCannotOmitAStableSize() {
  return (
    // @ts-expect-error Function styles require targetSize or visualSize for Native geometry.
    <IconButton
      accessibilityLabel="닫기"
      style={({ pressed }) => ({ height: 40, opacity: pressed ? 0.7 : 1, width: 40 })}
    >
      ×
    </IconButton>
  );
}
