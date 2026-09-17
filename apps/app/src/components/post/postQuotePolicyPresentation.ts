import { PostQuotePolicy } from '@kosmo/core/enums';

type PostQuotePolicyPresentation = Readonly<{
  description: string;
  label: string;
}>;

export const postQuotePolicyPresentation = {
  [PostQuotePolicy.EVERYONE]: {
    description: '모든 사람이 인용할 수 있어요.',
    label: '모두',
  },
  [PostQuotePolicy.FOLLOWERS]: {
    description: '나를 팔로우하는 사람이 인용할 수 있어요.',
    label: '팔로워',
  },
  [PostQuotePolicy.AUTHOR]: {
    description: '나만 인용할 수 있어요.',
    label: '본인만',
  },
} as const satisfies Record<PostQuotePolicy, PostQuotePolicyPresentation>;

export const postQuotePolicyOptions = [
  PostQuotePolicy.EVERYONE,
  PostQuotePolicy.FOLLOWERS,
  PostQuotePolicy.AUTHOR,
] as const;
