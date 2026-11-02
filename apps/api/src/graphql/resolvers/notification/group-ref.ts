import { builder } from '@/graphql/builder';
import type { ReactionNotificationGroupRow } from './group-query';

export type {
  ReactionNotificationGroupMemberRow,
  ReactionNotificationGroupRow,
} from './group-query';

export const ReactionNotificationGroup = builder.objectRef<ReactionNotificationGroupRow>(
  'ReactionNotificationGroup',
);

ReactionNotificationGroup.implement({});
