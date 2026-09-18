import { PostQuotePolicy } from '@kosmo/core/enums';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import type { PostVisibility } from '@kosmo/core/enums';

export type PostComposerVisibility = 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
export type PostComposerQuotePolicy = PostQuotePolicy;

export const defaultPostComposerQuotePolicy = PostQuotePolicy.EVERYONE;

export function resolvePostComposerVisibility(
  value: string | null | undefined,
): PostComposerVisibility {
  if (value === 'PUBLIC') {
    return 'PUBLIC';
  }
  if (value === 'FOLLOWERS') {
    return 'FOLLOWERS';
  }
  return 'UNLISTED';
}

export function createPostComposerMutationInput(
  bodyText: string,
  visibility: PostVisibility,
  replyParentId?: string,
  contentWarning?: string | null,
  repostSourceId?: string,
  quotePolicy?: PostComposerQuotePolicy,
) {
  const normalizedContentWarning = normalizePostContentPlainText(contentWarning ?? '');

  return {
    bodyText,
    ...(normalizedContentWarning ? { contentWarning: normalizedContentWarning } : {}),
    ...(replyParentId ? { replyParentId } : {}),
    ...(repostSourceId ? { repostSourceId } : {}),
    ...(quotePolicy && isPostComposerQuotePolicyVisible(visibility) ? { quotePolicy } : {}),
    visibility,
  };
}

export function isPostComposerQuotePolicyVisible(visibility: PostVisibility): boolean {
  return visibility === 'PUBLIC' || visibility === 'UNLISTED';
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
  repostSourceId?: string,
): string {
  return `${selectedProfileId}:${replyParentId ?? 'post'}:${repostSourceId ?? 'source-none'}`;
}
