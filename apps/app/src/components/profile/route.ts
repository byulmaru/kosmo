export function normalizeProfileHandle(profileHandle?: string | string[]): string {
  const value = Array.isArray(profileHandle) ? profileHandle[0] : profileHandle;

  return (value ?? '').replace(/^@/, '');
}
