import type { PostVisibility } from '@kosmo/core/enums';

export type PostComposerVisibility = 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';

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
) {
  return {
    bodyText,
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
