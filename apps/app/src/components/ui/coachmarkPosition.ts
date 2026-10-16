import { space } from '../../theme/tokens';

const EDGE_INSET = space[16];
const ANCHOR_GAP = space[12];
const ARROW_INSET = space[16];

export type CoachmarkRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type CoachmarkPositionInput = Readonly<{
  anchor: CoachmarkRect;
  bubble: Pick<CoachmarkRect, 'height' | 'width'>;
  viewport: Readonly<{
    bottomInset?: number;
    height: number;
    leftInset?: number;
    rightInset?: number;
    topInset?: number;
    width: number;
  }>;
}>;

export type CoachmarkPosition = Readonly<{
  arrowLeft: number;
  height: number;
  left: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
  top: number;
  width: number;
}>;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function getCoachmarkPosition({
  anchor,
  bubble,
  viewport,
}: CoachmarkPositionInput): CoachmarkPosition {
  const safeTop = (viewport.topInset ?? 0) + EDGE_INSET;
  const safeBottom = viewport.height - (viewport.bottomInset ?? 0) - EDGE_INSET;
  const safeLeft = (viewport.leftInset ?? 0) + EDGE_INSET;
  const safeRight = viewport.width - (viewport.rightInset ?? 0) - EDGE_INSET;
  const width = Math.min(bubble.width, Math.max(0, safeRight - safeLeft));
  const left = clamp(anchor.x + anchor.width / 2 - width / 2, safeLeft, safeRight - width);
  const topSpace = Math.max(0, anchor.y - safeTop - ANCHOR_GAP);
  const bottomSpace = Math.max(0, safeBottom - (anchor.y + anchor.height) - ANCHOR_GAP);
  const placement = bubble.height <= bottomSpace || bottomSpace >= topSpace ? 'bottom' : 'top';
  const maxHeight = Math.min(
    placement === 'bottom' ? bottomSpace : topSpace,
    Math.max(0, safeBottom - safeTop),
  );
  const height = Math.min(bubble.height, maxHeight);
  const top = clamp(
    placement === 'bottom' ? anchor.y + anchor.height + ANCHOR_GAP : anchor.y - ANCHOR_GAP - height,
    safeTop,
    safeBottom - height,
  );
  const arrowLeft = clamp(anchor.x + anchor.width / 2 - left, ARROW_INSET, width - ARROW_INSET);

  return { arrowLeft, height, left, maxHeight, placement, top, width };
}
