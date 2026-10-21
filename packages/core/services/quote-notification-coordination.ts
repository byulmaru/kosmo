import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  Instances,
  NotificationQuoteJudgments,
  Notifications,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, PostState, ProfileState } from '../enums';
import { postVisibilityCondition } from '../visibility/post';
import { materializeNotification } from './notification-policy';
import type { Transaction } from '../db';

export const QuoteNotificationJudgmentOutcome = {
  EMITTED: 'EMITTED',
  EXCLUDED_PRELAUNCH: 'EXCLUDED_PRELAUNCH',
  REPRESENTED_BY_EXISTING: 'REPRESENTED_BY_EXISTING',
  SUPPRESSED: 'SUPPRESSED',
} as const;

export type QuoteNotificationJudgmentOutcome =
  (typeof QuoteNotificationJudgmentOutcome)[keyof typeof QuoteNotificationJudgmentOutcome];

type CoordinatedNotificationKind = Extract<NotificationKind, 'QUOTE' | 'REPLY'>;

type MaterializeCoordinatedNotificationInput = {
  readonly actorAccountId: string | null;
  readonly eligible: boolean;
  readonly kind: CoordinatedNotificationKind;
  readonly quotePostId: string;
  readonly recipientProfileId: string;
  readonly relatedProfileId: string;
  readonly sourceId: string;
  readonly suppressedOutcome?: QuoteNotificationJudgmentOutcome;
};

export type MaterializedReplyNotification = {
  readonly notificationIds: string[];
  readonly recipientProfileId: string;
};

const ReplyParents = alias(Posts, 'reply_notification_parent');
const ReplyAuthors = alias(Profiles, 'reply_notification_author');
const ReplyAuthorInstances = alias(Instances, 'reply_notification_author_instance');

const quoteNotificationCandidates = async (
  database: Transaction,
  quotePostId: string,
  recipientProfileId: string,
) =>
  database
    .select({ id: Notifications.id, kind: Notifications.kind })
    .from(Notifications)
    .where(
      and(
        eq(Notifications.sourceId, quotePostId),
        eq(Notifications.recipientProfileId, recipientProfileId),
        or(
          inArray(Notifications.kind, [NotificationKind.QUOTE, NotificationKind.REPLY]),
          sql`${Notifications.kind}::text = 'MENTION'`,
        ),
      ),
    )
    .orderBy(Notifications.kind, Notifications.recipientAccountId, Notifications.id);

/** Must run inside the transaction that owns the judgment and projection writes. */
export const materializeCoordinatedNotification = async (
  database: Transaction,
  {
    actorAccountId,
    eligible,
    kind,
    quotePostId,
    recipientProfileId,
    relatedProfileId,
    sourceId,
    suppressedOutcome,
  }: MaterializeCoordinatedNotificationInput,
): Promise<string[]> => {
  const judgmentCondition = and(
    eq(NotificationQuoteJudgments.quotePostId, quotePostId),
    eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
  );
  const inserted = await database
    .insert(NotificationQuoteJudgments)
    .values({
      outcome: suppressedOutcome ?? QuoteNotificationJudgmentOutcome.SUPPRESSED,
      quotePostId,
      recipientProfileId,
    })
    .onConflictDoNothing({
      target: [
        NotificationQuoteJudgments.quotePostId,
        NotificationQuoteJudgments.recipientProfileId,
      ],
    })
    .returning({ quotePostId: NotificationQuoteJudgments.quotePostId });

  if (inserted.length === 0) {
    const judgment = await database
      .select({
        notificationId: NotificationQuoteJudgments.representativeNotificationId,
        outcome: NotificationQuoteJudgments.outcome,
        representativeKind: NotificationQuoteJudgments.representativeKind,
      })
      .from(NotificationQuoteJudgments)
      .where(judgmentCondition)
      .limit(1)
      .then((rows) => rows[0]);
    if (
      judgment?.outcome !== QuoteNotificationJudgmentOutcome.EMITTED ||
      judgment.representativeKind !== kind
    ) {
      return [];
    }

    return database
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, kind),
          eq(Notifications.recipientProfileId, recipientProfileId),
          eq(Notifications.sourceId, sourceId),
        ),
      )
      .orderBy(Notifications.recipientAccountId, Notifications.id)
      .then((rows) => rows.map(({ id }) => id));
  }

  const candidates = await quoteNotificationCandidates(database, quotePostId, recipientProfileId);
  if (candidates.length > 0) {
    const candidateKinds = [...new Set(candidates.map(({ kind: candidateKind }) => candidateKind))];
    if (candidateKinds.length > 1) {
      console.warn('Multiple notification representatives found for Quote', {
        quotePostId,
        recipientProfileId,
      });
    }

    const representative = candidateKinds.length === 1 ? candidates[0] : undefined;
    await database
      .update(NotificationQuoteJudgments)
      .set({
        outcome: QuoteNotificationJudgmentOutcome.REPRESENTED_BY_EXISTING,
        representativeKind: representative ? candidateKinds[0]! : null,
        representativeNotificationId: representative?.id ?? null,
      })
      .where(judgmentCondition);
    return [];
  }

  if (suppressedOutcome || !eligible) {
    return [];
  }

  if (relatedProfileId === recipientProfileId) {
    return [];
  }

  const notificationIds = await materializeNotification(database, {
    actorAccountId,
    kind,
    recipientProfileId,
    relatedProfileId,
    sourceId,
  });

  if (notificationIds.length === 0) {
    const concurrentCandidate = await quoteNotificationCandidates(
      database,
      quotePostId,
      recipientProfileId,
    );
    if (concurrentCandidate.length === 0) {
      return [];
    }

    const candidateKinds = [
      ...new Set(concurrentCandidate.map(({ kind: candidateKind }) => candidateKind)),
    ];
    const representative = candidateKinds.length === 1 ? concurrentCandidate[0] : undefined;
    await database
      .update(NotificationQuoteJudgments)
      .set({
        outcome: QuoteNotificationJudgmentOutcome.REPRESENTED_BY_EXISTING,
        representativeKind: representative ? candidateKinds[0]! : null,
        representativeNotificationId: representative?.id ?? null,
      })
      .where(judgmentCondition);
    return [];
  }

  await database
    .update(NotificationQuoteJudgments)
    .set({
      outcome: QuoteNotificationJudgmentOutcome.EMITTED,
      representativeKind: kind,
      representativeNotificationId: notificationIds[0]!,
    })
    .where(judgmentCondition);
  return notificationIds;
};

/**
 * Evaluates the Reply candidate in the caller's transaction. Quote approval
 * uses this before Quote materialization so Reply priority cannot depend on
 * which Activity reaches the judgment row first.
 */
export const materializeReplyNotificationIfEligible = async (
  database: Transaction,
  postId: string,
): Promise<MaterializedReplyNotification | null> => {
  const source = await database
    .select({
      actorAccountId: Posts.actorAccountId,
      id: Posts.id,
      relatedProfileId: Posts.profileId,
      recipientProfileId: ReplyParents.profileId,
      repostSourceId: Posts.repostSourceId,
    })
    .from(Posts)
    .innerJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .innerJoin(Profiles, eq(Profiles.id, ReplyParents.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ReplyAuthors, eq(ReplyAuthors.id, Posts.profileId))
    .innerJoin(ReplyAuthorInstances, eq(ReplyAuthorInstances.id, ReplyAuthors.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, ReplyParents.profileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(Posts.id, postId),
        ne(Posts.profileId, ReplyParents.profileId),
        eq(ReplyParents.state, PostState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        postVisibilityCondition({
          columns: {
            authorProfileId: Posts.profileId,
            authorVisible: and(
              eq(ReplyAuthors.state, ProfileState.ACTIVE),
              ne(ReplyAuthorInstances.state, InstanceState.SUSPENDED),
            )!,
            postContentId: Posts.currentContentId,
            postState: Posts.state,
            postVisibility: Posts.visibility,
          },
          viewerFollowsAuthor: isNotNull(ProfileFollows.id),
          viewerProfileId: ReplyParents.profileId,
        }),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!source) {
    return null;
  }

  if (source.repostSourceId !== null) {
    const notificationIds = await materializeCoordinatedNotification(database, {
      actorAccountId: source.actorAccountId,
      eligible: true,
      kind: NotificationKind.REPLY,
      quotePostId: source.id,
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
    return { notificationIds, recipientProfileId: source.recipientProfileId };
  }

  const notificationIds = await materializeNotification(database, {
    actorAccountId: source.actorAccountId,
    kind: NotificationKind.REPLY,
    recipientProfileId: source.recipientProfileId,
    relatedProfileId: source.relatedProfileId,
    sourceId: source.id,
  });
  return { notificationIds, recipientProfileId: source.recipientProfileId };
};
