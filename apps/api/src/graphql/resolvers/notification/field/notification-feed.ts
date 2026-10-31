import { db, Notifications, Reactions, withPrimaryDatabase } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { NotificationFeedConnection, NotificationFeedItem } from '../feed-ref';
import {
  loadReactionNotificationGroupMembers,
  parseReactionNotificationGroupId,
  reactionNotificationGroupBucket,
  reactionNotificationGroupIdentity,
} from '../group-query';
import { requireProfileNotificationMembership } from './profile';
import type { DatabaseHandle } from '@kosmo/core/db';
import type {
  ReactionNotificationGroupMemberRow,
  ReactionNotificationGroupRow,
} from '../group-query';
import type { NotificationRow } from '../ref';

type FeedCandidate = {
  readonly id: string;
  readonly kind: 'NOTIFICATION' | 'REACTION_GROUP';
  readonly sortAt: Temporal.Instant;
};

type FeedCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

type FeedRow =
  | NotificationRow
  | (ReactionNotificationGroupRow & { readonly feedSortAt: Temporal.Instant });

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeFeedCursor = (row: FeedRow) => {
  const sortAt = 'feedSortAt' in row ? row.feedSortAt : row.createdAt;
  return Buffer.from(JSON.stringify([sortAt.toString(), row.id])).toString('base64url');
};

const isValidFeedId = (id: string) => {
  try {
    parseUuid(id);
    return true;
  } catch {
    try {
      parseReactionNotificationGroupId(id);
      return true;
    } catch {
      return false;
    }
  }
};

const decodeFeedCursor = (cursor: string): FeedCursor => {
  try {
    if (!base64UrlPattern.test(cursor)) {
      throw new Error('Invalid base64url');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid cursor payload');
    }

    const createdAt = Temporal.Instant.from(value[0]);
    if (!isValidFeedId(value[1])) {
      throw new Error('Invalid cursor ID');
    }

    return { createdAt, id: value[1] };
  } catch {
    throw new ValidationError('Invalid Notification Feed cursor');
  }
};

const loadFeedCandidates = async (
  database: DatabaseHandle,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  before: FeedCursor | undefined,
  after: FeedCursor | undefined,
  inverted: boolean,
  limit: number,
): Promise<FeedCandidate[]> => {
  const identity = reactionNotificationGroupIdentity();
  const bucket = reactionNotificationGroupBucket();
  const reactionWhere = visibleViewerNotificationWhere({ ctx, profileId });
  const notificationWhere = visibleViewerNotificationWhere({ ctx, profileId });
  const bounds = [
    after
      ? sql`("sortAt" < ${after.createdAt.toString()} OR ("sortAt" = ${after.createdAt.toString()} AND "id" < ${after.id}))`
      : undefined,
    before
      ? sql`("sortAt" > ${before.createdAt.toString()} OR ("sortAt" = ${before.createdAt.toString()} AND "id" > ${before.id}))`
      : undefined,
  ].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);

  const rows = await database.execute(sql`
    WITH reaction_groups AS (
      SELECT
        ${identity} AS "id",
        'REACTION_GROUP'::text AS "kind",
        max(${Notifications.createdAt}) AS "sortAt"
      FROM ${Notifications}
      INNER JOIN ${Reactions} ON ${eq(Reactions.id, Notifications.sourceId)}
      WHERE ${and(eq(Notifications.kind, NotificationKind.REACTION), reactionWhere)}
      GROUP BY
        ${Notifications.recipientAccountId},
        ${Notifications.recipientProfileId},
        ${Reactions.postId},
        ${bucket}
    ), ordinary_notifications AS (
      SELECT
        ${Notifications.id}::text AS "id",
        'NOTIFICATION'::text AS "kind",
        ${Notifications.createdAt} AS "sortAt"
      FROM ${Notifications}
      WHERE ${and(ne(Notifications.kind, NotificationKind.REACTION), notificationWhere)}
    ), feed AS (
      SELECT "id", "kind", "sortAt" FROM reaction_groups
      UNION ALL
      SELECT "id", "kind", "sortAt" FROM ordinary_notifications
    )
    SELECT "id", "kind", "sortAt"
    FROM feed
    ${bounds.length > 0 ? sql`WHERE ${sql.join(bounds, sql` AND `)}` : sql``}
    ORDER BY "sortAt" ${inverted ? sql`ASC` : sql`DESC`}, "id" ${inverted ? sql`ASC` : sql`DESC`}
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind === 'REACTION_GROUP' ? ('REACTION_GROUP' as const) : ('NOTIFICATION' as const),
    sortAt: Temporal.Instant.from(String(row.sortAt)),
  }));
};

const loadNotificationRows = async (
  database: DatabaseHandle,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  ids: readonly string[],
) => {
  if (ids.length === 0) {
    return [] as NotificationRow[];
  }

  return (await database
    .select()
    .from(Notifications)
    .where(
      and(
        inArray(Notifications.id, ids),
        ne(Notifications.kind, NotificationKind.REACTION),
        visibleViewerNotificationWhere({ ctx, profileId }),
      ),
    )) as NotificationRow[];
};

const loadFeedRows = async (
  database: DatabaseHandle,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  before: FeedCursor | undefined,
  after: FeedCursor | undefined,
  inverted: boolean,
  limit: number,
) => {
  const candidates = await loadFeedCandidates(
    database,
    profileId,
    ctx,
    before,
    after,
    inverted,
    limit,
  );
  const groupIds = candidates.filter(({ kind }) => kind === 'REACTION_GROUP').map(({ id }) => id);
  const notificationIds = candidates
    .filter(({ kind }) => kind === 'NOTIFICATION')
    .map(({ id }) => id);
  const [members, notifications] = await Promise.all([
    loadReactionNotificationGroupMembers(database, ctx, profileId, groupIds),
    loadNotificationRows(database, profileId, ctx, notificationIds),
  ]);
  const membersByGroup = new Map<string, ReactionNotificationGroupMemberRow[]>();
  for (const member of members) {
    const groupMembers = membersByGroup.get(member.groupId) ?? [];
    groupMembers.push(member);
    membersByGroup.set(member.groupId, groupMembers);
  }
  const groupsById = new Map<string, ReactionNotificationGroupRow>();
  for (const [id, groupMembers] of membersByGroup) {
    const latestMember = groupMembers[0];
    if (!latestMember) {
      continue;
    }

    groupsById.set(id, {
      __typename: 'ReactionNotificationGroup',
      id,
      latestAt: latestMember.createdAt,
      members: groupMembers,
      postId: latestMember.postId,
      unread: groupMembers.some(({ readAt }) => readAt === null),
    });
  }
  const notificationsById = new Map(
    notifications.map((notification) => [notification.id, notification]),
  );

  return candidates.flatMap((candidate): FeedRow[] => {
    if (candidate.kind === 'REACTION_GROUP') {
      const group = groupsById.get(candidate.id);
      return group ? [{ ...group, feedSortAt: candidate.sortAt }] : [];
    }

    const notification = notificationsById.get(candidate.id);
    return notification ? [notification] : [];
  });
};

builder.objectField(Profile, 'notificationFeed', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: NotificationFeedItem,
      resolve: async (profile, args, ctx) => {
        await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

        return withPrimaryDatabase(() =>
          resolveCursorConnection<Promise<FeedRow[]>>(
            { args, toCursor: encodeFeedCursor },
            ({ before, after, limit, inverted }) => {
              const beforeCursor = before ? decodeFeedCursor(before) : undefined;
              const afterCursor = after ? decodeFeedCursor(after) : undefined;
              return loadFeedRows(db, profile.id, ctx, beforeCursor, afterCursor, inverted, limit);
            },
          ),
        );
      },
    },
    NotificationFeedConnection as never,
  ),
);

builder.objectField(Profile, 'unreadNotificationFeedCount', (t) =>
  t.withAuth({ login: true }).field({
    type: 'Int',
    nullable: true,
    resolve: async (profile, _, ctx) => {
      await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

      return withPrimaryDatabase(async () => {
        const groupRows = await db.execute(sql`
          SELECT count(*) AS "count"
          FROM (
            SELECT ${Reactions.postId}, ${reactionNotificationGroupBucket()}
            FROM ${Notifications}
            INNER JOIN ${Reactions} ON ${eq(Reactions.id, Notifications.sourceId)}
            WHERE ${and(
              eq(Notifications.kind, NotificationKind.REACTION),
              sql`${Notifications.recipientAccountId} = ${ctx.session.accountId}`,
              eq(Notifications.recipientProfileId, profile.id),
              visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
            )}
            GROUP BY ${Reactions.postId}, ${reactionNotificationGroupBucket()}
            HAVING bool_or(${Notifications.readAt} IS NULL)
          ) unread_groups
        `);
        const ordinaryRows = await db
          .select({ count: count() })
          .from(Notifications)
          .where(
            and(
              ne(Notifications.kind, NotificationKind.REACTION),
              sql`${Notifications.readAt} IS NULL`,
              visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
            ),
          );

        return Number(groupRows[0]?.count ?? 0) + Number(ordinaryRows[0]?.count ?? 0);
      });
    },
  }),
);
