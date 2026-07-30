export function createPostShareReference(
  canonicalOrigin: string,
  relativeHandle: string,
  postId: string,
): string {
  const origin = canonicalOrigin.replace(/\/$/, '');
  const handleSegment = encodeURIComponent(relativeHandle).replace(/%40/gi, '@');
  const postSegment = encodeURIComponent(postId);

  return `${origin}/${handleSegment}/${postSegment}`;
}
