import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import type { PostVisibility } from '@kosmo/core/enums';

export function createPostComposerMutationInput(
  bodyText: string,
  visibility: PostVisibility,
  replyParentId?: string,
  contentWarning?: string | null,
) {
  const normalizedContentWarning = normalizePostContentPlainText(contentWarning ?? '');

  return {
    bodyText,
    ...(normalizedContentWarning ? { contentWarning: normalizedContentWarning } : {}),
    ...(replyParentId ? { replyParentId } : {}),
    visibility,
  };
}

export function isPostComposerVisibilityAllowed(
  visibility: PostVisibility,
  replyParentId?: string,
): boolean {
  return !(replyParentId && visibility === 'DIRECT');
}

export function createPostComposerContextKey(
  selectedProfileId: string,
  replyParentId?: string,
): string {
  return `${selectedProfileId}:${replyParentId ?? 'post'}`;
}
