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
  pinToBottom = false,
  safeAreaBottom,
  width,
}: {
  height: number;
  pinToBottom?: boolean;
  safeAreaBottom: number;
  width: number;
}): PublicContentInvitationPlacement {
  if (pinToBottom && width < breakpoints.compact) {
    return { bottom: 0, left: 0, mode: 'fixed', right: 0 };
  }

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
