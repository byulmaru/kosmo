import { PostQuotePolicy } from '@kosmo/core/enums';

export const postQuotePolicyLabels = {
  [PostQuotePolicy.EVERYONE]: '모두',
  [PostQuotePolicy.FOLLOWERS]: '내 팔로워',
  [PostQuotePolicy.AUTHOR]: '본인만',
} as const satisfies Record<PostQuotePolicy, string>;

export const postQuotePolicyOptions = [
  PostQuotePolicy.EVERYONE,
  PostQuotePolicy.FOLLOWERS,
  PostQuotePolicy.AUTHOR,
] as const;
