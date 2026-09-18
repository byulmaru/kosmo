import { spacing } from '@/theme/tokens';

export type PostListPresentation = 'mobile' | 'wide';

export const postListMetrics = {
  mobile: {
    connectorLeft: spacing.lg + spacing.xxxl / 2,
    inset: spacing.lg,
  },
  wide: {
    connectorLeft: spacing.sm + spacing.xxxl / 2,
    inset: spacing.sm,
  },
} as const satisfies Record<PostListPresentation, { connectorLeft: number; inset: number }>;
