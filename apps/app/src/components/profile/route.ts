export type ProfileConnectionKind = 'followers' | 'following';

export function getProfileConnectionKind(pathname: string): ProfileConnectionKind | null {
  const segments = pathname.split('/').filter(Boolean);
  const kind = segments.length === 2 && segments[0]?.startsWith('@') ? segments.at(-1) : undefined;

  return kind === 'followers' || kind === 'following' ? kind : null;
}

export function normalizeProfileHandle(profileHandle?: string | string[]): string {
  const value = Array.isArray(profileHandle) ? profileHandle[0] : profileHandle;

  return (value ?? '').replace(/^@/, '');
}
