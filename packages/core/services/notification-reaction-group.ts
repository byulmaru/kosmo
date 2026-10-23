import { and, asc, eq, exists, inArray, sql } from 'drizzle-orm';
import {
  db,
  Notifications,
  ReactionNotificationGroupMembers,
  ReactionNotificationGroups,
  Reactions,
} from '../db';
import { NotificationKind } from '../enums';
import type { Database, Transaction } from '../db';

const GROUP_WINDOW_HOURS = 48;
const ASSIGNMENT_BATCH_SIZE = 500;
const MAX_SERIALIZATION_RETRIES = 2;

export type ReactionNotificationGroupScope = {
  readonly recipientAccountId: string;
  readonly recipientProfileId: string;
};

const getPostgresErrorCode = (error: unknown): unknown =>
  error && typeof error === 'object' && 'code' in error ? error.code : undefined;

const getPostgresConstraintName = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if ('constraint_name' in error) {
    return error.constraint_name;
  }
  return 'constraint' in error ? error.constraint : undefined;
};

const getPostgresCause = (error: unknown) =>
  error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;

const isSerializationFailure = (error: unknown) =>
  getPostgresErrorCode(error) === '40001' ||
  getPostgresErrorCode(getPostgresCause(error)) === '40001';

const isConcurrentGroupUniqueViolation = (error: unknown) => {
  const cause = getPostgresCause(error);
  const code = getPostgresErrorCode(error) ?? getPostgresErrorCode(cause);
  const constraintName = getPostgresConstraintName(error) ?? getPostgresConstraintName(cause);
  return (
    code === '23505' &&
    (constraintName === 'reaction_notification_group_anchor_notification_id_key' ||
      constraintName === 'reaction_notification_group_member_pkey' ||
      constraintName === 'reaction_notification_group_member_notification_id_pk')
  );
};

export const withReactionNotificationGroupTransaction = async <T>(
  database: Database,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> => {
  let retriesRemaining = MAX_SERIALIZATION_RETRIES;

  while (true) {
    try {
      return await database.transaction(callback, { isolationLevel: 'serializable' });
    } catch (error) {
      if (
        (!isSerializationFailure(error) && !isConcurrentGroupUniqueViolation(error)) ||
        retriesRemaining === 0
      ) {
        throw error;
      }
      retriesRemaining -= 1;
    }
  }
};

type CandidateNotification = {
  readonly id: string;
  readonly createdAt: Temporal.Instant;
  readonly postId: string;
};

type GroupCandidate = {
  readonly id: string;
  readonly anchorNotificationId: string;
  readonly postId: string;
  readonly startedAt: Temporal.Instant;
};

const compareGroupCandidates = (left: GroupCandidate, right: GroupCandidate) => {
  const startedAt = Temporal.Instant.compare(left.startedAt, right.startedAt);
  if (startedAt !== 0) {
    return startedAt;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

const isWithinGroupWindow = (
  group: Pick<GroupCandidate, 'startedAt'>,
  createdAt: Temporal.Instant,
) =>
  Temporal.Instant.compare(group.startedAt, createdAt) <= 0 &&
  Temporal.Instant.compare(createdAt, group.startedAt.add({ hours: GROUP_WINDOW_HOURS })) < 0;

const assignReactionNotificationGroupsInBatch = async (
  tx: Transaction,
  scope: ReactionNotificationGroupScope,
): Promise<number> => {
  const candidates = await tx
    .select({
      createdAt: Notifications.createdAt,
      id: Notifications.id,
      postId: Reactions.postId,
    })
    .from(Notifications)
    .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
    .where(
      and(
        eq(Notifications.kind, NotificationKind.REACTION),
        eq(Notifications.recipientAccountId, scope.recipientAccountId),
        eq(Notifications.recipientProfileId, scope.recipientProfileId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${ReactionNotificationGroupMembers}
          WHERE ${ReactionNotificationGroupMembers.notificationId} = ${Notifications.id}
        )`,
      ),
    )
    .orderBy(asc(Notifications.createdAt), asc(Notifications.id))
    .limit(ASSIGNMENT_BATCH_SIZE);

  if (candidates.length === 0) {
    return 0;
  }

  const postIds = [...new Set(candidates.map(({ postId }) => postId))];
  const earliestCreatedAt = candidates[0]!.createdAt;
  const latestCreatedAt = candidates[candidates.length - 1]!.createdAt;
  const existingGroups = await tx
    .select({
      anchorNotificationId: ReactionNotificationGroups.anchorNotificationId,
      id: ReactionNotificationGroups.id,
      postId: ReactionNotificationGroups.postId,
      startedAt: ReactionNotificationGroups.startedAt,
    })
    .from(ReactionNotificationGroups)
    .where(
      and(
        eq(ReactionNotificationGroups.recipientAccountId, scope.recipientAccountId),
        eq(ReactionNotificationGroups.recipientProfileId, scope.recipientProfileId),
        inArray(ReactionNotificationGroups.postId, postIds),
        sql`${ReactionNotificationGroups.startedAt} <= ${latestCreatedAt.toString()}`,
        sql`${ReactionNotificationGroups.startedAt} + interval '48 hours' > ${earliestCreatedAt.toString()}`,
        exists(
          tx
            .select({ notificationId: ReactionNotificationGroupMembers.notificationId })
            .from(ReactionNotificationGroupMembers)
            .innerJoin(
              Notifications,
              eq(Notifications.id, ReactionNotificationGroupMembers.notificationId),
            )
            .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
            .where(
              and(
                eq(ReactionNotificationGroupMembers.groupId, ReactionNotificationGroups.id),
                eq(Notifications.kind, NotificationKind.REACTION),
                eq(Notifications.recipientAccountId, scope.recipientAccountId),
                eq(Notifications.recipientProfileId, scope.recipientProfileId),
                eq(Reactions.postId, ReactionNotificationGroups.postId),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(ReactionNotificationGroups.startedAt), asc(ReactionNotificationGroups.id));

  const groupsByPost = new Map<string, GroupCandidate[]>();
  for (const group of existingGroups) {
    const groups = groupsByPost.get(group.postId) ?? [];
    groups.push(group);
    groupsByPost.set(group.postId, groups);
  }

  const newGroups: Array<{
    readonly anchorNotificationId: string;
    readonly postId: string;
    readonly startedAt: Temporal.Instant;
  }> = [];
  const assignments: Array<{ readonly groupKey: string; readonly notificationId: string }> = [];

  for (const candidate of candidates as CandidateNotification[]) {
    const groups = groupsByPost.get(candidate.postId) ?? [];
    let group = groups.find(({ startedAt }) =>
      isWithinGroupWindow({ startedAt }, candidate.createdAt),
    );

    if (!group) {
      group = {
        anchorNotificationId: candidate.id,
        id: candidate.id,
        postId: candidate.postId,
        startedAt: candidate.createdAt,
      };
      groups.push(group);
      groups.sort(compareGroupCandidates);
      groupsByPost.set(candidate.postId, groups);
      newGroups.push({
        anchorNotificationId: candidate.id,
        postId: candidate.postId,
        startedAt: candidate.createdAt,
      });
    }

    assignments.push({ groupKey: group.id, notificationId: candidate.id });
  }

  const insertedGroups =
    newGroups.length === 0
      ? []
      : await tx
          .insert(ReactionNotificationGroups)
          .values(
            newGroups.map((group) => ({
              anchorNotificationId: group.anchorNotificationId,
              postId: group.postId,
              recipientAccountId: scope.recipientAccountId,
              recipientProfileId: scope.recipientProfileId,
              startedAt: group.startedAt,
            })),
          )
          .returning({
            anchorNotificationId: ReactionNotificationGroups.anchorNotificationId,
            id: ReactionNotificationGroups.id,
          });
  const groupIdsByAnchor = new Map(
    insertedGroups.map(({ anchorNotificationId, id }) => [anchorNotificationId, id]),
  );

  await tx.insert(ReactionNotificationGroupMembers).values(
    assignments.map(({ groupKey, notificationId }) => ({
      groupId: groupIdsByAnchor.get(groupKey) ?? groupKey,
      notificationId,
    })),
  );

  return candidates.length;
};

export const assignReactionNotificationGroups = async (
  tx: Transaction,
  scope: ReactionNotificationGroupScope,
): Promise<void> => {
  while ((await assignReactionNotificationGroupsInBatch(tx, scope)) === ASSIGNMENT_BATCH_SIZE) {
    // Continue until this serializable snapshot has no more unassigned rows.
  }
};

export const ensureReactionNotificationGroups = async (
  scope: ReactionNotificationGroupScope,
  handle?: Database,
): Promise<void> => {
  await withReactionNotificationGroupTransaction(handle ?? db, (tx) =>
    assignReactionNotificationGroups(tx, scope),
  );
};
