import {
  db,
  NotificationFeedSnapshots,
  Notifications,
  ReactionNotificationGroupMembers,
  ReactionNotificationGroups,
  Reactions,
  withPrimaryDatabase,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import {
  NotificationFeedSnapshotExpiredError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { ensureReactionNotificationGroups } from '@kosmo/core/services';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import {
  and,
  count,
  countDistinct,
  eq,
  getColumns,
  inArray,
  isNull,
  max,
  ne,
  sql,
} from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { NotificationFeedConnection, NotificationFeedItem } from '../feed-ref';
import { loadReactionNotificationGroupMembers } from '../loader/group';
import { requireProfileNotificationMembership } from './profile';
import type { NotificationFeedSnapshotItem, Transaction } from '@kosmo/core/db';
import type {
  ReactionNotificationGroupFeedRow,
  ReactionNotificationGroupMemberRow,
} from '../group-ref';
import type { NotificationRow } from '../ref';

type NotificationFeedRow = NotificationRow | ReactionNotificationGroupFeedRow;
type NotificationFeedCandidate =
  | NotificationRow
  | Omit<ReactionNotificationGroupFeedRow, '__typename' | 'members'>;
type SnapshotFeedRow = NotificationFeedRow & {
  readonly snapshotId: string;
  readonly snapshotPosition: number;
};
type FeedCursor = { readonly snapshotId: string; readonly position: number };

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeFeedCursor = (row: SnapshotFeedRow) =>
  Buffer.from(JSON.stringify([row.snapshotId, row.snapshotPosition])).toString('base64url');

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
      typeof value[1] !== 'number' ||
      !Number.isSafeInteger(value[1]) ||
      value[1] < 0
    ) {
      throw new Error('Invalid cursor payload');
    }

    parseUuid(value[0]);
    return { snapshotId: value[0], position: value[1] };
  } catch {
    throw new ValidationError('Invalid Notification Feed cursor');
  }
};

const compareFeedRows = (left: NotificationFeedCandidate, right: NotificationFeedCandidate) => {
  const leftTimestamp = 'latestAt' in left ? left.latestAt : left.createdAt;
  const rightTimestamp = 'latestAt' in right ? right.latestAt : right.createdAt;
  const timestamp = Temporal.Instant.compare(leftTimestamp, rightTimestamp);
  if (timestamp !== 0) {
    return -timestamp;
  }

  const id = left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return -id;
};

const snapshotItems = (items: readonly NotificationFeedSnapshotItem[]) =>
  items.map((item, position) => ({ ...item, position }));

const loadSnapshot = async (
  database: Transaction,
  cursor: FeedCursor,
  accountId: string,
  profileId: string,
) => {
  const snapshot = await database
    .select({
      ...getColumns(NotificationFeedSnapshots),
      expired: sql<boolean>`${NotificationFeedSnapshots.expiresAt} <= now()`,
    })
    .from(NotificationFeedSnapshots)
    .where(eq(NotificationFeedSnapshots.id, cursor.snapshotId))
    .then((rows) => rows[0]);

  if (!snapshot) {
    throw new NotificationFeedSnapshotExpiredError();
  }
  if (snapshot.recipientAccountId !== accountId || snapshot.recipientProfileId !== profileId) {
    throw new PermissionDeniedError('Profile membership is required');
  }
  if (snapshot.expired) {
    throw new NotificationFeedSnapshotExpiredError();
  }

  const items = snapshotItems(snapshot.items);
  if (cursor.position >= items.length) {
    throw new ValidationError('Invalid Notification Feed cursor');
  }

  return { snapshot, items };
};

const loadGroupRows = async (
  database: Transaction,
  accountId: string,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  groupIds?: readonly string[],
) => {
  if (groupIds && groupIds.length === 0) {
    return [] as Array<Omit<ReactionNotificationGroupFeedRow, '__typename' | 'members'>>;
  }

  const latestAt = max(Notifications.createdAt);
  return (await database
    .select({
      ...getColumns(ReactionNotificationGroups),
      latestAt,
    })
    .from(ReactionNotificationGroups)
    .innerJoin(
      ReactionNotificationGroupMembers,
      eq(ReactionNotificationGroupMembers.groupId, ReactionNotificationGroups.id),
    )
    .innerJoin(Notifications, eq(Notifications.id, ReactionNotificationGroupMembers.notificationId))
    .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
    .where(
      and(
        eq(ReactionNotificationGroups.recipientAccountId, accountId),
        eq(ReactionNotificationGroups.recipientProfileId, profileId),
        eq(Notifications.kind, NotificationKind.REACTION),
        groupIds ? inArray(ReactionNotificationGroups.id, groupIds) : undefined,
        visibleViewerNotificationWhere({ ctx, profileId }),
      ),
    )
    .groupBy(
      ReactionNotificationGroups.id,
      ReactionNotificationGroups.recipientAccountId,
      ReactionNotificationGroups.recipientProfileId,
      ReactionNotificationGroups.postId,
      ReactionNotificationGroups.startedAt,
      ReactionNotificationGroups.anchorNotificationId,
    )) as Array<Omit<ReactionNotificationGroupFeedRow, '__typename' | 'members'>>;
};

const loadNotificationRows = async (
  database: Transaction,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  notificationIds?: readonly string[],
) => {
  if (notificationIds && notificationIds.length === 0) {
    return [] as NotificationRow[];
  }

  return (await database
    .select(getColumns(Notifications))
    .from(Notifications)
    .where(
      and(
        notificationIds ? inArray(Notifications.id, notificationIds) : undefined,
        ne(Notifications.kind, NotificationKind.REACTION),
        visibleViewerNotificationWhere({ ctx, profileId }),
      ),
    )) as NotificationRow[];
};

const createSnapshot = async (
  database: Transaction,
  accountId: string,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
) => {
  const groups = await loadGroupRows(database, accountId, profileId, ctx);
  const notifications = await loadNotificationRows(database, profileId, ctx);
  const rows = [...groups, ...notifications].sort(compareFeedRows) as NotificationFeedRow[];
  const items: NotificationFeedSnapshotItem[] = rows.map((row) => ({
    id: row.id,
    kind: 'latestAt' in row ? 'REACTION_GROUP' : 'NOTIFICATION',
  }));
  const snapshot = await database
    .insert(NotificationFeedSnapshots)
    .values({
      recipientAccountId: accountId,
      recipientProfileId: profileId,
      items,
    })
    .returning()
    .then((rows) => rows[0]!);

  return { snapshot, items: snapshotItems(items) };
};

const loadSnapshotRows = async (
  database: Transaction,
  items: readonly (NotificationFeedSnapshotItem & { readonly position: number })[],
  snapshotId: string,
  accountId: string,
  profileId: string,
  ctx: Parameters<typeof visibleViewerNotificationWhere>[0]['ctx'],
  inverted: boolean,
  before: FeedCursor | undefined,
  after: FeedCursor | undefined,
  limit: number,
) => {
  const start = after?.position ?? -1;
  const end = before?.position ?? items.length;
  const candidates = items.filter(({ position }) => position > start && position < end);
  const orderedCandidates = inverted ? [...candidates].reverse() : candidates;
  const rows: SnapshotFeedRow[] = [];
  const batchSize = 200;
  for (
    let offset = 0;
    offset < orderedCandidates.length && rows.length < limit;
    offset += batchSize
  ) {
    const batch = orderedCandidates.slice(offset, offset + batchSize);
    const groupIds = batch.filter(({ kind }) => kind === 'REACTION_GROUP').map(({ id }) => id);
    const notificationIds = batch.filter(({ kind }) => kind === 'NOTIFICATION').map(({ id }) => id);
    const [groups, notifications] = await Promise.all([
      loadGroupRows(database, accountId, profileId, ctx, groupIds),
      loadNotificationRows(database, profileId, ctx, notificationIds),
    ]);
    const rowsById = new Map<string, NotificationFeedRow>([
      ...groups.map(
        (group) =>
          [
            `REACTION_GROUP:${group.id}`,
            { ...group, __typename: 'ReactionNotificationGroup', members: [] },
          ] as const,
      ),
      ...notifications.map(
        (notification) => [`NOTIFICATION:${notification.id}`, notification] as const,
      ),
    ]);
    for (const item of batch) {
      const row = rowsById.get(`${item.kind}:${item.id}`);
      if (row) {
        rows.push({ ...row, snapshotId, snapshotPosition: item.position });
        if (rows.length >= limit) {
          break;
        }
      }
    }
  }

  return rows;
};

const cleanupExpiredSnapshots = async () => {
  // shortcut: idle periods do not clean snapshots; switch to scheduled cleanup if hard retention is needed.
  await db.delete(NotificationFeedSnapshots).where(
    sql`${NotificationFeedSnapshots.id} IN (
      SELECT ${NotificationFeedSnapshots.id}
      FROM ${NotificationFeedSnapshots}
      WHERE ${NotificationFeedSnapshots.expiresAt} <= now()
      ORDER BY ${NotificationFeedSnapshots.expiresAt} ASC
      LIMIT 100
    )`,
  );
};

const attachGroupMembers = async (
  rows: readonly SnapshotFeedRow[],
  database: Transaction,
): Promise<SnapshotFeedRow[]> => {
  const groupIds = rows.flatMap((row) => ('latestAt' in row ? [row.id] : []));
  if (groupIds.length === 0) {
    return [...rows];
  }

  const members = await loadReactionNotificationGroupMembers(groupIds, database);
  const membersByGroup = new Map<string, ReactionNotificationGroupMemberRow[]>();
  for (const member of members) {
    const groupMembers = membersByGroup.get(member.groupId) ?? [];
    groupMembers.push(member);
    membersByGroup.set(member.groupId, groupMembers);
  }

  return rows.map((row) =>
    'latestAt' in row
      ? {
          ...row,
          members: membersByGroup.get(row.id) ?? [],
        }
      : row,
  ) as SnapshotFeedRow[];
};

builder.objectField(Profile, 'notificationFeed', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: NotificationFeedItem,
      resolve: async (profile, args, ctx) => {
        await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

        return withPrimaryDatabase(async () => {
          await ensureReactionNotificationGroups({
            recipientAccountId: ctx.session.accountId,
            recipientProfileId: profile.id,
          });

          let snapshotCreated = false;
          const connection = await resolveCursorConnection<Promise<SnapshotFeedRow[]>>(
            { args, toCursor: encodeFeedCursor },
            async ({ before, after, limit, inverted }) => {
              const beforeCursor = before ? decodeFeedCursor(before) : undefined;
              const afterCursor = after ? decodeFeedCursor(after) : undefined;
              if (
                beforeCursor &&
                afterCursor &&
                beforeCursor.snapshotId !== afterCursor.snapshotId
              ) {
                throw new ValidationError('Invalid Notification Feed cursor');
              }

              const rows = await db.transaction(
                async (tx) => {
                  let snapshotId: string;
                  let items: readonly (NotificationFeedSnapshotItem & {
                    readonly position: number;
                  })[];
                  if (beforeCursor || afterCursor) {
                    const cursor = afterCursor ?? beforeCursor!;
                    const loaded = await loadSnapshot(
                      tx,
                      cursor,
                      ctx.session.accountId,
                      profile.id,
                    );
                    if (
                      (beforeCursor && beforeCursor.position >= loaded.items.length) ||
                      (afterCursor && afterCursor.position >= loaded.items.length)
                    ) {
                      throw new ValidationError('Invalid Notification Feed cursor');
                    }
                    snapshotId = loaded.snapshot.id;
                    items = loaded.items;
                  } else {
                    const created = await createSnapshot(
                      tx,
                      ctx.session.accountId,
                      profile.id,
                      ctx,
                    );
                    snapshotCreated = true;
                    snapshotId = created.snapshot.id;
                    items = created.items;
                  }

                  return attachGroupMembers(
                    await loadSnapshotRows(
                      tx,
                      items,
                      snapshotId,
                      ctx.session.accountId,
                      profile.id,
                      ctx,
                      inverted,
                      beforeCursor,
                      afterCursor,
                      limit,
                    ),
                    tx,
                  );
                },
                { isolationLevel: 'repeatable read' },
              );

              if (snapshotCreated) {
                await cleanupExpiredSnapshots();
              }
              return rows;
            },
          );

          return connection;
        });
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
        await ensureReactionNotificationGroups({
          recipientAccountId: ctx.session.accountId,
          recipientProfileId: profile.id,
        });

        const [unreadGroups, unreadNotifications] = await Promise.all([
          db
            .select({ count: countDistinct(ReactionNotificationGroups.id) })
            .from(ReactionNotificationGroups)
            .innerJoin(
              ReactionNotificationGroupMembers,
              eq(ReactionNotificationGroupMembers.groupId, ReactionNotificationGroups.id),
            )
            .innerJoin(
              Notifications,
              eq(Notifications.id, ReactionNotificationGroupMembers.notificationId),
            )
            .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
            .where(
              and(
                eq(ReactionNotificationGroups.recipientAccountId, ctx.session.accountId),
                eq(ReactionNotificationGroups.recipientProfileId, profile.id),
                eq(Notifications.kind, NotificationKind.REACTION),
                isNull(Notifications.readAt),
                visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
              ),
            ),
          db
            .select({ count: count() })
            .from(Notifications)
            .where(
              and(
                ne(Notifications.kind, NotificationKind.REACTION),
                isNull(Notifications.readAt),
                visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
              ),
            ),
        ]);

        return (unreadGroups[0]?.count ?? 0) + (unreadNotifications[0]?.count ?? 0);
      });
    },
  }),
);
