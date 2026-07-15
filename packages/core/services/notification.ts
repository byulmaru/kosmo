import { and, eq } from 'drizzle-orm';
import { db, firstOrThrowWith, Instances, Notifications, Profiles } from '../db';
import { InstanceKind, NotificationKind } from '../enums';
import { NotFoundError } from '../error';
import type { ProfileFollows } from '../db';

type ProfileFollowSource = Pick<
  typeof ProfileFollows.$inferSelect,
  'id' | 'followerProfileId' | 'followeeProfileId'
>;

export const createFollowNotification = async (source: ProfileFollowSource): Promise<void> => {
  await db
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(Profiles.id, source.followeeProfileId), eq(Instances.kind, InstanceKind.LOCAL)))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.FOLLOW,
      recipientProfileId: source.followeeProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};

export const deleteNotificationBySource = async (
  kind: NotificationKind,
  sourceId: string,
): Promise<void> => {
  await db
    .delete(Notifications)
    .where(and(eq(Notifications.kind, kind), eq(Notifications.sourceId, sourceId)));
};
