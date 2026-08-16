import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  Notifications,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, PostState, ProfileState } from '../enums';
import { NotFoundError } from '../error';
import type { Database } from '../db';

const NotificationRepostAuthors = alias(Profiles, 'notification_repost_author');
const NotificationRepostAuthorInstances = alias(Instances, 'notification_repost_author_instance');
const NotificationRepostRelatedPosts = alias(Posts, 'notification_repost_related_post');
const NotificationRepostRecipients = alias(Profiles, 'notification_repost_recipient');
const NotificationRepostRecipientInstances = alias(
  Instances,
  'notification_repost_recipient_instance',
);

export type NotificationEffectOperation = 'create' | 'delete';

export type NotificationEffectErrorContext = {
  readonly notificationKind: NotificationKind;
  readonly operation: NotificationEffectOperation;
  readonly sourceId: string;
};

export type NotificationEffectErrorReporter = (
  error: unknown,
  context: NotificationEffectErrorContext,
) => void;

type NotificationEffectErrorHandler = (error: unknown) => void | Promise<void>;

let notificationEffectErrorReporter: NotificationEffectErrorReporter = (error, context) => {
  console.error('Notification effect failed', { context, error });
};

export const setNotificationEffectErrorReporter = (
  reporter: NotificationEffectErrorReporter,
): (() => void) => {
  const previous = notificationEffectErrorReporter;
  notificationEffectErrorReporter = reporter;
  return () => {
    if (notificationEffectErrorReporter === reporter) {
      notificationEffectErrorReporter = previous;
    }
  };
};

const reportNotificationEffectError = (
  error: unknown,
  context: NotificationEffectErrorContext,
): void => {
  try {
    notificationEffectErrorReporter(error, context);
  } catch (reportingError) {
    console.error('Notification effect error reporting failed', { context, reportingError });
  }
};

const runPostCommitNotificationEffect = async (
  context: NotificationEffectErrorContext,
  effect: () => Promise<void>,
  onError?: NotificationEffectErrorHandler,
): Promise<void> => {
  try {
    await effect();
  } catch (error) {
    if (!onError) {
      reportNotificationEffectError(error, context);
      return;
    }

    try {
      await onError(error);
    } catch (observerError) {
      console.error('Notification effect observation failed', {
        context,
        error,
        observerError,
      });
    }
  }
};

export const createFollowNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle).transaction(async (tx) => {
    const source = await tx
      .select({ id: ProfileFollows.id, recipientProfileId: ProfileFollows.followeeProfileId })
      .from(ProfileFollows)
      .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(and(eq(ProfileFollows.id, sourceId), eq(Instances.kind, InstanceKind.LOCAL)))
      .limit(1)
      .for('update', { of: ProfileFollows })
      .then((rows) => rows[0]);

    // The relation may be consumed by a concurrent terminal action before this
    // post-commit projection is materialized. There is no Notification to project.
    if (!source) {
      return;
    }

    await tx
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
  });
};

export const createFollowRequestNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle).transaction(async (tx) => {
    const source = await tx
      .select({
        id: ProfileFollowRequests.id,
        recipientProfileId: ProfileFollowRequests.followeeProfileId,
      })
      .from(ProfileFollowRequests)
      .innerJoin(Profiles, eq(Profiles.id, ProfileFollowRequests.followeeProfileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(ProfileFollowRequests.id, sourceId),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .for('update', { of: ProfileFollowRequests })
      .then((rows) => rows[0]);

    // The source may have reached a terminal state between the source commit and this
    // post-commit effect. In that case there is no Notification to project.
    if (!source) {
      return;
    }

    await tx
      .insert(Notifications)
      .values({
        data: {},
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: source.recipientProfileId,
        sourceId: source.id,
      })
      .onConflictDoNothing({
        target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
      });
  });
};

export const createFollowRequestNotificationPostCommit = async (
  sourceId: string,
  handle?: Database,
  onError?: NotificationEffectErrorHandler,
): Promise<void> =>
  runPostCommitNotificationEffect(
    {
      notificationKind: NotificationKind.FOLLOW_REQUEST,
      operation: 'create',
      sourceId,
    },
    () => createFollowRequestNotification(sourceId, handle),
    onError,
  );

export const createReactionNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle).transaction(async (tx) => {
    const source = await tx
      .select({
        actorProfileId: Reactions.profileId,
        id: Reactions.id,
        recipientInstanceKind: Instances.kind,
        recipientProfileId: Posts.profileId,
      })
      .from(Reactions)
      .innerJoin(Posts, eq(Posts.id, Reactions.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Reactions.id, sourceId))
      .limit(1)
      .for('update', { of: Reactions })
      .then((rows) => rows[0]);

    // An inbound Undo may remove the source before notification materialization.
    // The committed reaction lifecycle remains authoritative, so this is an expected no-op.
    if (!source) {
      return;
    }

    if (
      source.actorProfileId === source.recipientProfileId ||
      source.recipientInstanceKind !== InstanceKind.LOCAL
    ) {
      return;
    }

    await tx
      .insert(Notifications)
      .values({
        data: {},
        kind: NotificationKind.REACTION,
        recipientProfileId: source.recipientProfileId,
        sourceId: source.id,
      })
      .onConflictDoNothing({
        target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
      });
  });
};

export const createRepostNotification = async (
  sourceId: string,
  handle?: Database,
): Promise<void> => {
  const connection = getDatabaseConnection(handle);
  const source = await connection
    .select({
      actorProfileId: Posts.profileId,
      id: Posts.id,
      recipientInstanceKind: NotificationRepostRecipientInstances.kind,
      recipientProfileId: NotificationRepostRelatedPosts.profileId,
    })
    .from(Posts)
    .innerJoin(NotificationRepostAuthors, eq(NotificationRepostAuthors.id, Posts.profileId))
    .innerJoin(
      NotificationRepostAuthorInstances,
      eq(NotificationRepostAuthorInstances.id, NotificationRepostAuthors.instanceId),
    )
    .innerJoin(
      NotificationRepostRelatedPosts,
      eq(NotificationRepostRelatedPosts.id, Posts.repostSourceId),
    )
    .innerJoin(
      NotificationRepostRecipients,
      eq(NotificationRepostRecipients.id, NotificationRepostRelatedPosts.profileId),
    )
    .innerJoin(
      NotificationRepostRecipientInstances,
      eq(NotificationRepostRecipientInstances.id, NotificationRepostRecipients.instanceId),
    )
    .where(
      and(
        eq(Posts.id, sourceId),
        eq(Posts.state, PostState.ACTIVE),
        isNull(Posts.currentContentId),
        isNull(Posts.replyParentId),
        isNotNull(Posts.repostSourceId),
        eq(NotificationRepostAuthors.state, ProfileState.ACTIVE),
        ne(NotificationRepostAuthorInstances.state, InstanceState.SUSPENDED),
        eq(NotificationRepostRelatedPosts.state, PostState.ACTIVE),
        isNotNull(NotificationRepostRelatedPosts.currentContentId),
        eq(NotificationRepostRecipients.state, ProfileState.ACTIVE),
        ne(NotificationRepostRecipientInstances.state, InstanceState.SUSPENDED),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Repost not found')));

  if (
    source.actorProfileId === source.recipientProfileId ||
    source.recipientInstanceKind !== InstanceKind.LOCAL
  ) {
    return;
  }

  await connection
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REPOST,
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
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle)
    .delete(Notifications)
    .where(and(eq(Notifications.kind, kind), eq(Notifications.sourceId, sourceId)));
};

export const deleteFollowRequestNotificationPostCommit = async (
  sourceId: string,
  handle?: Database,
): Promise<void> =>
  runPostCommitNotificationEffect(
    {
      notificationKind: NotificationKind.FOLLOW_REQUEST,
      operation: 'delete',
      sourceId,
    },
    () => deleteNotificationBySource(NotificationKind.FOLLOW_REQUEST, sourceId, handle),
  );
