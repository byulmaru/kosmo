import { builder } from '@/graphql/builder';

export const FeedbackKind = builder.enumType('FeedbackKind', {
  values: ['POSITIVE', 'NEGATIVE', 'FEATURE_REQUEST', 'BUG_REPORT'] as const,
});
