import { Notifications, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, or, sql } from 'drizzle-orm';
import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';
import { visibleViewerNotificationWhere } from './access/visibility';
import type { DatabaseHandle } from '@kosmo/core/db';
import type { UserContext } from '@/context';

export const REACTION_GROUP_BUCKET_SECONDS = 48 * 60 * 60;

export type ReactionNotificationGroupMemberRow = {
  readonly createdAt: Temporal.Instant;
  readonly groupId: string;
  readonly notificationId: string;
  readonly postId: string;
  readonly profileId: string;
  readonly reactionId: string;
  readonly reactionType: string;
  readonly readAt: Temporal.Instant | null;
};

export type ReactionNotificationGroupRow = {
  readonly __typename: 'ReactionNotificationGroup';
  readonly id: string;
  readonly latestAt: Temporal.Instant;
  readonly members: readonly ReactionNotificationGroupMemberRow[];
  readonly postId: string;
  readonly unread: boolean;
};

export const parseReactionNotificationGroupId = (id: string) => {
  const parts = id.split('|');
  if (parts.length !== 4 || !/^-?(0|[1-9]\d*)$/.test(parts[3]!)) {
    throw new Error('Invalid reaction notification group ID');
  }

  const [recipientAccountId, recipientProfileId, postId, bucket] = parts;
  if (!recipientAccountId || !recipientProfileId || !postId) {
    throw new Error('Invalid reaction notification group ID');
  }

  for (const uuid of [recipientAccountId, recipientProfileId, postId]) {
    try {
      if (stringifyUuid(parseUuid(uuid)) !== uuid) {
        throw new Error('Non-canonical UUID');
      }
    } catch {
      throw new Error('Invalid reaction notification group ID');
    }
  }

  return { bucket, postId, recipientAccountId, recipientProfileId };
};

export const reactionNotificationGroupBucket = () =>
  sql<string>`floor(extract(epoch from ${Notifications.createdAt}) / ${sql.raw(String(REACTION_GROUP_BUCKET_SECONDS))})::bigint::text`;

export const reactionNotificationGroupIdentity = () =>
  sql<string>`concat(${Notifications.recipientAccountId}, '|', ${Notifications.recipientProfileId}, '|', ${Reactions.postId}, '|', ${reactionNotificationGroupBucket()})`;

const groupIdWhere = (ids: readonly string[]) => {
  if (ids.length === 0) {
    return sql`false`;
  }

  const parsed = ids.map(parseReactionNotificationGroupId);
  const bucket = reactionNotificationGroupBucket();
  return or(
    ...parsed.map(({ bucket: groupBucket, postId, recipientAccountId, recipientProfileId }) =>
      and(
        eq(Notifications.recipientAccountId, recipientAccountId),
        eq(Notifications.recipientProfileId, recipientProfileId),
        eq(Reactions.postId, postId),
        sql`${bucket} = ${groupBucket}`,
      ),
    ),
  );
};

export const loadReactionNotificationGroupMembers = async (
  database: DatabaseHandle,
  ctx: UserContext,
  profileId: string,
  ids: readonly string[],
): Promise<ReactionNotificationGroupMemberRow[]> => {
  const accountId = ctx.session?.accountId;
  if (!accountId || ids.length === 0) {
    return [];
  }

  const rows = await database
    .select({
      createdAt: Notifications.createdAt,
      groupId: reactionNotificationGroupIdentity(),
      notificationId: Notifications.id,
      postId: Reactions.postId,
      profileId: Reactions.profileId,
      reactionId: Reactions.id,
      reactionType: Reactions.type,
      readAt: Notifications.readAt,
    })
    .from(Notifications)
    .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
    .where(
      and(
        eq(Notifications.kind, NotificationKind.REACTION),
        eq(Notifications.recipientAccountId, accountId),
        eq(Notifications.recipientProfileId, profileId),
        visibleViewerNotificationWhere({ ctx, profileId }),
        groupIdWhere(ids),
      ),
    )
    .orderBy(sql`${Notifications.createdAt} DESC`, sql`${Notifications.id} DESC`);

  return rows;
};
