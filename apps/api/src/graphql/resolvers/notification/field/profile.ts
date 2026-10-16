import { AccountProfiles, db, Notifications } from '@kosmo/core/db';
import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, isNull, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import type { Database } from '@kosmo/core/db';
import type { UserContext } from '@/context';
import type { NotificationRow } from '../ref';

type NotificationCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeNotificationCursor = ({ createdAt, id }: NotificationRow) =>
  Buffer.from(JSON.stringify([createdAt.toString(), id])).toString('base64url');

const decodeNotificationCursor = (cursor: string): NotificationCursor => {
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

    const [createdAt, id] = value;
    parseUuid(id);

    return { createdAt: Temporal.Instant.from(createdAt), id };
  } catch {
    throw new ValidationError('Invalid Notification cursor');
  }
};

const resolveNotificationCursor = async (
  cursor: string,
  profileId: string,
  ctx: UserContext,
): Promise<NotificationCursor> => {
  try {
    parseUuid(cursor);
  } catch {
    return decodeNotificationCursor(cursor);
  }

  const [notification] = await db
    .select({ createdAt: Notifications.createdAt, id: Notifications.id })
    .from(Notifications)
    .where(and(eq(Notifications.id, cursor), visibleViewerNotificationWhere({ ctx, profileId })))
    .limit(1);

  if (!notification) {
    throw new ValidationError('Invalid Notification cursor');
  }

  return notification;
};

const notificationCursorWhere = async (
  cursor: string | null | undefined,
  direction: 'after' | 'before',
  profileId: string,
  ctx: UserContext,
) => {
  if (!cursor) {
    return undefined;
  }

  const { createdAt, id } = await resolveNotificationCursor(cursor, profileId, ctx);

  return direction === 'after'
    ? or(
        lt(Notifications.createdAt, createdAt),
        and(eq(Notifications.createdAt, createdAt), lt(Notifications.id, id)),
      )
    : or(
        gt(Notifications.createdAt, createdAt),
        and(eq(Notifications.createdAt, createdAt), gt(Notifications.id, id)),
      );
};

const requireProfileNotificationMembership = async (
  accountId: string,
  profileId: string,
  database: Database,
) => {
  const membership = await database
    .select({ id: AccountProfiles.id })
    .from(AccountProfiles)
    .where(and(eq(AccountProfiles.accountId, accountId), eq(AccountProfiles.profileId, profileId)))
    .limit(1);

  if (membership.length === 0) {
    throw new PermissionDeniedError('Profile membership is required');
  }
};

builder.objectField(Profile, 'notifications', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: Notification,
      resolve: async (profile, args, ctx) => {
        await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

        return resolveCursorConnection<Promise<NotificationRow[]>>(
          { args, toCursor: encodeNotificationCursor },
          async ({ before, after, limit, inverted }) => {
            const [beforeWhere, afterWhere] = await Promise.all([
              notificationCursorWhere(before, 'before', profile.id, ctx),
              notificationCursorWhere(after, 'after', profile.id, ctx),
            ]);

            return db
              .select(getColumns(Notifications))
              .from(Notifications)
              .where(
                and(
                  visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
                  beforeWhere,
                  afterWhere,
                ),
              )
              .orderBy(
                inverted ? asc(Notifications.createdAt) : desc(Notifications.createdAt),
                inverted ? asc(Notifications.id) : desc(Notifications.id),
              )
              .limit(limit);
          },
        );
      },
    },
    NotificationConnection as never,
  ),
);

builder.objectField(Profile, 'unreadNotificationCount', (t) =>
  t.withAuth({ login: true }).field({
    type: 'Int',
    nullable: true,
    resolve: async (profile, _, ctx) => {
      await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

      const [result] = await db
        .select({ count: count() })
        .from(Notifications)
        .where(
          and(
            visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
            isNull(Notifications.readAt),
          ),
        );

      return result?.count ?? 0;
    },
  }),
);
