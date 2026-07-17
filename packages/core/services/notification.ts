import { and, eq } from 'drizzle-orm';
import { db, firstOrThrowWith, Instances, Notifications, ProfileFollows, Profiles } from '../db';
import { InstanceKind, NotificationKind } from '../enums';
import { NotFoundError } from '../error';

export const createFollowNotification = async (sourceId: string): Promise<void> => {
  const source = await db
    .select({
      id: ProfileFollows.id,
      recipientProfileId: ProfileFollows.followeeProfileId,
    })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(ProfileFollows.id, sourceId), eq(Instances.kind, InstanceKind.LOCAL)))
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow not found')));

  await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.FOLLOW,
      recipientProfileId: source.recipientProfileId,
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
