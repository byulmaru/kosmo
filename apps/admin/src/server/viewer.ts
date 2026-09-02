import { normalizeIdentityHeader } from './identity';

const ANONYMOUS_VIEWER = '식별 정보 없는 Admin Console Viewer';

export interface Viewer {
  label: string;
  login?: string;
}

export function getViewerFromHeaders(headers: Headers): Viewer {
  const login = normalizeIdentityHeader(headers.get('Tailscale-User-Login') ?? undefined);
  const displayName = normalizeIdentityHeader(headers.get('Tailscale-User-Name') ?? undefined);

  return {
    label: displayName ?? login ?? ANONYMOUS_VIEWER,
    ...(login ? { login } : {}),
  };
}
