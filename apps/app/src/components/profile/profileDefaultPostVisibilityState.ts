import { PostVisibility } from '@kosmo/core/enums';

export const resolveProfileDefaultVisibility = (
  value: string | null | undefined,
): PostVisibility =>
  value === PostVisibility.PUBLIC ||
  value === PostVisibility.UNLISTED ||
  value === PostVisibility.FOLLOWERS
    ? value
    : PostVisibility.UNLISTED;
