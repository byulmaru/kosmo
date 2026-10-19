export const getPostReplyActionCount = (
  contentAvailable: boolean,
  replyCount: number | null | undefined,
): number | undefined =>
  contentAvailable && replyCount != null && replyCount > 0 ? replyCount : undefined;
