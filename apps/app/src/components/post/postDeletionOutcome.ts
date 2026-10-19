export type PostDeletionMutationOutcome =
  | { kind: 'committed'; postId: string }
  | { kind: 'failed'; message: string };

export function getPostDeletionMutationOutcome(
  response:
    | {
        deletePost?: {
          postId?: string | null;
          replyParent?: { id: string; replyCount?: number | null } | null;
        } | null;
      }
    | null
    | undefined,
  errors: readonly { message: string }[] | null | undefined,
  fallbackMessage: string,
): PostDeletionMutationOutcome {
  const postId = response?.deletePost?.postId;

  return postId
    ? { kind: 'committed', postId }
    : { kind: 'failed', message: errors?.[0]?.message ?? fallbackMessage };
}
