import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  getDatabaseConnection,
  Instances,
  NotificationQuoteJudgments,
  NotificationRollouts,
  Notifications,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  ProfileMutes,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import type { Database, DatabaseHandle } from '../db';

export const QUOTE_NOTIFICATION_ROLLOUT_KEY = 'QUOTE_NOTIFICATION';

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

const QuoteNotificationSourcePosts = alias(Posts, 'quote_notification_source_post');
const QuoteNotificationQuoteAuthors = alias(Profiles, 'quote_notification_quote_author');
const QuoteNotificationQuoteAuthorInstances = alias(
  Instances,
  'quote_notification_quote_author_instance',
);
const QuoteNotificationSourceAuthors = alias(Profiles, 'quote_notification_source_author');
const QuoteNotificationSourceAuthorInstances = alias(
  Instances,
  'quote_notification_source_author_instance',
);

const isPublicPost = (visibility: PostVisibility) =>
  visibility === PostVisibility.PUBLIC || visibility === PostVisibility.UNLISTED;

const isVisibleToProfile = ({
  authorProfileId,
  currentContentId,
  followsAuthor,
  postState,
  postVisibility,
  viewerProfileId,
}: {
  readonly authorProfileId: string;
  readonly currentContentId: string | null;
  readonly followsAuthor: boolean;
  readonly postState: PostState;
  readonly postVisibility: PostVisibility;
  readonly viewerProfileId: string;
}) => {
  if (postState !== PostState.ACTIVE || currentContentId === null) {
    return false;
  }

  return (
    isPublicPost(postVisibility) ||
    authorProfileId === viewerProfileId ||
    (postVisibility === PostVisibility.FOLLOWERS && followsAuthor)
  );
};

const hasProfileBlock = async (
  database: DatabaseHandle,
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
  database: DatabaseHandle,
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
  database: DatabaseHandle,
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

/**
 * Serializes Reply and Quote projections for a Quote post. The row is created
 * before the decision is evaluated, but the placeholder is never committed;
 * a failed transaction therefore remains retryable instead of becoming a
 * permanent suppression.
 */
export const materializeCoordinatedNotification = async (
  database: DatabaseHandle,
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
  const inserted = await database
    .insert(NotificationQuoteJudgments)
    .values({
      outcome: QuoteNotificationJudgmentOutcome.SUPPRESSED,
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
      .where(
        and(
          eq(NotificationQuoteJudgments.quotePostId, quotePostId),
          eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
        ),
      );
    return;
  }

  if (suppressedOutcome || !eligible) {
    await database
      .update(NotificationQuoteJudgments)
      .set({ outcome: suppressedOutcome ?? QuoteNotificationJudgmentOutcome.SUPPRESSED })
      .where(
        and(
          eq(NotificationQuoteJudgments.quotePostId, quotePostId),
          eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
        ),
      );
    return;
  }

  if (
    relatedProfileId === recipientProfileId ||
    (await hasProfileBlock(database, recipientProfileId, relatedProfileId)) ||
    (await hasProfileMute(database, recipientProfileId, relatedProfileId))
  ) {
    await database
      .update(NotificationQuoteJudgments)
      .set({ outcome: QuoteNotificationJudgmentOutcome.SUPPRESSED })
      .where(
        and(
          eq(NotificationQuoteJudgments.quotePostId, quotePostId),
          eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
        ),
      );
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
      .where(
        and(
          eq(NotificationQuoteJudgments.quotePostId, quotePostId),
          eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
        ),
      );
    return;
  }

  await database
    .update(NotificationQuoteJudgments)
    .set({
      outcome: QuoteNotificationJudgmentOutcome.EMITTED,
      representativeKind: kind,
      representativeNotificationId: notification.id,
    })
    .where(
      and(
        eq(NotificationQuoteJudgments.quotePostId, quotePostId),
        eq(NotificationQuoteJudgments.recipientProfileId, recipientProfileId),
      ),
    );
};

export const createQuoteNotification = async (
  quotePostId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle).transaction(async (database) => {
    const source = await database
      .select({
        activatedAt: NotificationRollouts.activatedAt,
        quoteAuthorId: Posts.profileId,
        quoteAuthorInstanceState: QuoteNotificationQuoteAuthorInstances.state,
        quoteAuthorState: QuoteNotificationQuoteAuthors.state,
        quoteCreatedAt: Posts.createdAt,
        quoteCurrentContentId: Posts.currentContentId,
        quotePostId: Posts.id,
        quotePostState: Posts.state,
        quoteVisibility: Posts.visibility,
        sourceAuthorInstanceKind: QuoteNotificationSourceAuthorInstances.kind,
        sourceAuthorInstanceState: QuoteNotificationSourceAuthorInstances.state,
        sourceAuthorState: QuoteNotificationSourceAuthors.state,
        sourceCurrentContentId: QuoteNotificationSourcePosts.currentContentId,
        sourcePostState: QuoteNotificationSourcePosts.state,
        sourceProfileId: QuoteNotificationSourcePosts.profileId,
        sourceVisibility: QuoteNotificationSourcePosts.visibility,
      })
      .from(Posts)
      .innerJoin(
        QuoteNotificationSourcePosts,
        eq(QuoteNotificationSourcePosts.id, Posts.repostSourceId),
      )
      .innerJoin(
        QuoteNotificationQuoteAuthors,
        eq(QuoteNotificationQuoteAuthors.id, Posts.profileId),
      )
      .innerJoin(
        QuoteNotificationQuoteAuthorInstances,
        eq(QuoteNotificationQuoteAuthorInstances.id, QuoteNotificationQuoteAuthors.instanceId),
      )
      .innerJoin(
        QuoteNotificationSourceAuthors,
        eq(QuoteNotificationSourceAuthors.id, QuoteNotificationSourcePosts.profileId),
      )
      .innerJoin(
        QuoteNotificationSourceAuthorInstances,
        eq(QuoteNotificationSourceAuthorInstances.id, QuoteNotificationSourceAuthors.instanceId),
      )
      .innerJoin(NotificationRollouts, eq(NotificationRollouts.key, QUOTE_NOTIFICATION_ROLLOUT_KEY))
      .where(eq(Posts.id, quotePostId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!source || source.sourceAuthorInstanceKind !== InstanceKind.LOCAL) {
      // The current mainline has no persisted remote Quote approval seam. A
      // remote Source is therefore fail-closed until its upstream adapter is
      // available; it must not consume the first judgment while pending.
      return;
    }

    const followsQuoteAuthor =
      (
        await database
          .select({ id: ProfileFollows.id })
          .from(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.followerProfileId, source.sourceProfileId),
              eq(ProfileFollows.followeeProfileId, source.quoteAuthorId),
            ),
          )
          .limit(1)
      ).length > 0;

    const quoteIsVisible = isVisibleToProfile({
      authorProfileId: source.quoteAuthorId,
      currentContentId: source.quoteCurrentContentId,
      followsAuthor: followsQuoteAuthor,
      postState: source.quotePostState,
      postVisibility: source.quoteVisibility,
      viewerProfileId: source.sourceProfileId,
    });
    const sourceIsAvailable =
      source.sourcePostState === PostState.ACTIVE &&
      source.sourceCurrentContentId !== null &&
      source.sourceAuthorState === ProfileState.ACTIVE &&
      source.sourceAuthorInstanceState === InstanceState.ACTIVE &&
      isPublicPost(source.sourceVisibility);
    const recipientIsAvailable =
      source.sourceAuthorState === ProfileState.ACTIVE &&
      source.sourceAuthorInstanceState === InstanceState.ACTIVE;
    const quoteAuthorIsAvailable =
      source.quoteAuthorState === ProfileState.ACTIVE &&
      source.quoteAuthorInstanceState !== InstanceState.SUSPENDED;
    const isPrelaunch = Temporal.Instant.compare(source.quoteCreatedAt, source.activatedAt) < 0;

    await materializeCoordinatedNotification(database, {
      eligible:
        quoteIsVisible && sourceIsAvailable && recipientIsAvailable && quoteAuthorIsAvailable,
      kind: NotificationKind.QUOTE,
      quotePostId: source.quotePostId,
      recipientProfileId: source.sourceProfileId,
      relatedProfileId: source.quoteAuthorId,
      sourceId: quotePostId,
      suppressedOutcome: isPrelaunch
        ? QuoteNotificationJudgmentOutcome.EXCLUDED_PRELAUNCH
        : undefined,
    });
  });
};

export const deleteQuoteNotification = async (
  quotePostId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle)
    .delete(Notifications)
    .where(
      and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quotePostId)),
    );
};
