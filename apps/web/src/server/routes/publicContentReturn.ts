export const PUBLIC_CONTENT_RETURN_TARGET_COOKIE = 'kosmo_public_content_return_target';

export function isSafePublicContentReturnTarget(value: string | null | undefined): value is string {
  if (
    !value ||
    !value.startsWith('/@') ||
    value.startsWith('//') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://kos.moe');
  } catch {
    return false;
  }
  if (
    parsed.origin !== 'https://kos.moe' ||
    parsed.pathname !== value ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return false;
  }

  const segments = value.slice(1).split('/');
  if (segments.length < 1 || segments.length > 2) {
    return false;
  }

  try {
    const [profileSegment, postSegment] = segments.map(decodeURIComponent);
    if (!profileSegment?.startsWith('@') || profileSegment.length < 2) {
      return false;
    }
    if (postSegment === 'followers' || postSegment === 'following') {
      return false;
    }
    return [profileSegment, postSegment].every((segment) => {
      if (segment === undefined) {
        return true;
      }
      const hasPathDelimiter = ['\\', '/', '?', '#'].some((delimiter) =>
        segment.includes(delimiter),
      );
      const hasControlCharacter = [...segment].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
      });
      return (
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !hasPathDelimiter &&
        !hasControlCharacter
      );
    });
  } catch {
    return false;
  }
}
