export function createPostShareReference(
  canonicalOrigin: string,
  relativeHandle: string,
  postSlug: string,
): string {
  const origin = canonicalOrigin.replace(/\/$/, '');
  const handleSegment = encodeURIComponent(relativeHandle).replace(/%40/gi, '@');
  const postSegment = encodeURIComponent(postSlug);

  return `${origin}/${handleSegment}/${postSegment}`;
}
