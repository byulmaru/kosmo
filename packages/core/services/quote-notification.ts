import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  getDatabaseConnection,
  Instances,
  NotificationRollouts,
  Posts,
  ProfileFollows,
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
import {
  materializeCoordinatedNotification,
  materializeReplyNotificationIfEligible,
  QuoteNotificationJudgmentOutcome,
} from './quote-notification-coordination';
import type { Database } from '../db';

export const QUOTE_NOTIFICATION_ROLLOUT_KEY = 'QUOTE_NOTIFICATION';

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

export const createQuoteNotification = async (
  quotePostId: string,
  handle?: Database,
): Promise<void> => {
  await getDatabaseConnection(handle).transaction(async (database) => {
    const source = await database
      .select({
        activatedAt: NotificationRollouts.activatedAt,
        quoteAuthorId: Posts.profileId,
        quoteAuthorInstanceKind: QuoteNotificationQuoteAuthorInstances.kind,
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
      .innerJoin(
        NotificationRollouts,
        and(
          eq(NotificationRollouts.key, QUOTE_NOTIFICATION_ROLLOUT_KEY),
          eq(NotificationRollouts.enabled, true),
        ),
      )
      .where(eq(Posts.id, quotePostId))
      .limit(1)
      .then((rows) => rows[0]);

    if (
      !source ||
      source.sourceAuthorInstanceKind !== InstanceKind.LOCAL ||
      source.quoteAuthorInstanceKind !== InstanceKind.LOCAL
    ) {
      // This slice consumes only the synchronous Local-to-Local approval path.
      // Neither a Remote Quote nor a Remote Source FK proves approval. Leave
      // its judgment untouched until the actual upstream approval adapter exists.
      return;
    }

    // Local Quote creation commits this relation only after validateQuoteSource
    // accepts the Local Source; Kosmo does not have a per-Quote manual approval
    // state for Local Sources.

    const replyRecipientProfileId = await materializeReplyNotificationIfEligible(
      database,
      quotePostId,
    );
    if (replyRecipientProfileId === source.sourceProfileId) {
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
    const quoteAuthorIsAvailable =
      source.quoteAuthorState === ProfileState.ACTIVE &&
      source.quoteAuthorInstanceState !== InstanceState.SUSPENDED;
    const isPrelaunch = Temporal.Instant.compare(source.quoteCreatedAt, source.activatedAt) < 0;

    await materializeCoordinatedNotification(database, {
      eligible: quoteIsVisible && sourceIsAvailable && quoteAuthorIsAvailable,
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
