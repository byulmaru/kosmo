import { PostVisibility } from '@kosmo/core/enums';

export const profileDefaultVisibilityFallback = PostVisibility.UNLISTED;

export const resolveProfileDefaultVisibility = (
  value: string | null | undefined,
): PostVisibility =>
  value === PostVisibility.PUBLIC ||
  value === PostVisibility.UNLISTED ||
  value === PostVisibility.FOLLOWERS
    ? value
    : profileDefaultVisibilityFallback;

export const isProfileDefaultVisibilityDirty = (
  saved: PostVisibility,
  selected: PostVisibility,
): boolean => saved !== selected;
