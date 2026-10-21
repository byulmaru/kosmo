import { breakpoints } from '@/theme/tokens';

export type PublicContentInvitationPlacement =
  | Readonly<{ mode: 'flow' }>
  | Readonly<{
      bottom: number;
      left: number | string;
      mode: 'fixed';
      right: number | string;
    }>;

export function getPublicContentInvitationPlacement({
  height,
  safeAreaBottom,
  width,
}: {
  height: number;
  safeAreaBottom: number;
  width: number;
}): PublicContentInvitationPlacement {
  if (height < 520 || width < 360) {
    return { mode: 'flow' };
  }

  const bottom = Math.max(0, safeAreaBottom);
  if (width < breakpoints.compact) {
    return {
      bottom: bottom + 80,
      left: 0,
      mode: 'fixed',
      right: 0,
    };
  }

  if (width < breakpoints.full) {
    return {
      bottom,
      left: `calc((100vw - 680px) / 2 + 80px)`,
      mode: 'fixed',
      right: `calc((100vw - 680px) / 2)`,
    };
  }

  return {
    bottom,
    left: `calc((100vw - 1240px) / 2 + 320px)`,
    mode: 'fixed',
    right: `calc((100vw - 1240px) / 2 + 320px)`,
  };
}
