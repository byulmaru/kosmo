import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  Instances,
  NotificationQuoteJudgments,
  Notifications,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  ProfileMutes,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, ProfileState } from '../enums';
import { postVisibilityCondition } from '../visibility/post';
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
  readonly eligible: boolean;
  readonly kind: CoordinatedNotificationKind;
  readonly quotePostId: string;
  readonly recipientProfileId: string;
  readonly relatedProfileId: string;
  readonly sourceId: string;
  readonly suppressedOutcome?: QuoteNotificationJudgmentOutcome;
};

const ReplyParents = alias(Posts, 'reply_notification_parent');
const ReplyAuthors = alias(Profiles, 'reply_notification_author');
const ReplyAuthorInstances = alias(Instances, 'reply_notification_author_instance');

const hasProfileBlock = async (
  database: Transaction,
  ownerProfileId: string,
  targetProfileId: string,
) =>
  database
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(
      or(
        and(
          eq(ProfileBlocks.ownerProfileId, ownerProfileId),
          eq(ProfileBlocks.targetProfileId, targetProfileId),
        ),
        and(
          eq(ProfileBlocks.ownerProfileId, targetProfileId),
          eq(ProfileBlocks.targetProfileId, ownerProfileId),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows.length > 0);

const hasProfileMute = async (
  database: Transaction,
  ownerProfileId: string,
  targetProfileId: string,
) =>
  database
    .select({ id: ProfileMutes.id })
    .from(ProfileMutes)
    .where(
      and(
        eq(ProfileMutes.ownerProfileId, ownerProfileId),
        eq(ProfileMutes.targetProfileId, targetProfileId),
        or(isNull(ProfileMutes.expiresAt), gt(ProfileMutes.expiresAt, sql`CURRENT_TIMESTAMP`)),
      ),
    )
    .limit(1)
    .then((rows) => rows.length > 0);

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
    );

/** Must run inside the transaction that owns the judgment and projection writes. */
export const materializeCoordinatedNotification = async (
  database: Transaction,
  {
    eligible,
    kind,
    quotePostId,
    recipientProfileId,
    relatedProfileId,
    sourceId,
    suppressedOutcome,
  }: MaterializeCoordinatedNotificationInput,
): Promise<void> => {
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
    return;
  }

  const candidates = await quoteNotificationCandidates(database, quotePostId, recipientProfileId);
  if (candidates.length > 0) {
    if (candidates.length > 1) {
      console.warn('Multiple notification representatives found for Quote', {
        quotePostId,
        recipientProfileId,
      });
    }

    const representative = candidates.length === 1 ? candidates[0] : undefined;
    await database
      .update(NotificationQuoteJudgments)
      .set({
        outcome: QuoteNotificationJudgmentOutcome.REPRESENTED_BY_EXISTING,
        representativeKind: representative?.kind ?? null,
        representativeNotificationId: representative?.id ?? null,
      })
      .where(judgmentCondition);
    return;
  }

  if (suppressedOutcome || !eligible) {
    return;
  }

  if (
    relatedProfileId === recipientProfileId ||
    (await hasProfileBlock(database, recipientProfileId, relatedProfileId)) ||
    (await hasProfileMute(database, recipientProfileId, relatedProfileId))
  ) {
    return;
  }

  const [notification] = await database
    .insert(Notifications)
    .values({
      data: {},
      kind,
      recipientProfileId,
      sourceId,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    })
    .returning({ id: Notifications.id });

  if (!notification) {
    const concurrentCandidate = await quoteNotificationCandidates(
      database,
      quotePostId,
      recipientProfileId,
    );
    const representative = concurrentCandidate.length === 1 ? concurrentCandidate[0] : undefined;
    await database
      .update(NotificationQuoteJudgments)
      .set({
        outcome: QuoteNotificationJudgmentOutcome.REPRESENTED_BY_EXISTING,
        representativeKind: representative?.kind ?? null,
        representativeNotificationId: representative?.id ?? null,
      })
      .where(judgmentCondition);
    return;
  }

  await database
    .update(NotificationQuoteJudgments)
    .set({
      outcome: QuoteNotificationJudgmentOutcome.EMITTED,
      representativeKind: kind,
      representativeNotificationId: notification.id,
    })
    .where(judgmentCondition);
};

/**
 * Evaluates the Reply candidate in the caller's transaction. Quote approval
 * uses this before Quote materialization so Reply priority cannot depend on
 * which Activity reaches the judgment row first.
 */
export const materializeReplyNotificationIfEligible = async (
  database: Transaction,
  postId: string,
): Promise<string | null> => {
  const source = await database
    .select({
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
    await materializeCoordinatedNotification(database, {
      eligible: true,
      kind: NotificationKind.REPLY,
      quotePostId: source.id,
      recipientProfileId: source.recipientProfileId,
      relatedProfileId: source.relatedProfileId,
      sourceId: source.id,
    });
    return source.recipientProfileId;
  }

  await database
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REPLY,
      recipientProfileId: source.recipientProfileId,
      sourceId: source.id,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
  return source.recipientProfileId;
};
