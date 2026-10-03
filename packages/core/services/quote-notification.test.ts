import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  HashtagMuteRules,
  Hashtags,
  Instances,
  NotificationQuoteJudgments,
  NotificationRollouts,
  Notifications,
  pg,
  PostContents,
  Posts,
  ProfileBlocks,
  ProfileHashtags,
  ProfileMutes,
  Profiles,
} from '../db';
import {
  HashtagMuteDecision,
  HashtagMuteScope,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost } from './post';
import { createQuoteNotification } from './quote-notification';

const profileIds: string[] = [];
const instanceIds: string[] = [];
const postIds: string[] = [];
const hashtagIds: string[] = [];

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  profileIds.push(profile.id);
  return profile;
};

const createContentPost = async (profileId: string, repostSourceId?: string) => {
  const result = await createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId,
    repostSourceId,
    visibility: PostVisibility.PUBLIC,
  });
  postIds.push(result.post.id);
  return result.post;
};

const createHashtag = async (name: string, displayName = name) => {
  const hashtag = await db
    .insert(Hashtags)
    .values({ name: `${name}-${crypto.randomUUID()}`, displayName })
    .returning()
    .then(firstOrThrow);
  hashtagIds.push(hashtag.id);
  return hashtag;
};

const createHashtagMuteRule = async ({
  ownerProfileId,
  targetHashtagId,
  decision = HashtagMuteDecision.EXCLUDE,
  expiresAt = null,
}: {
  readonly ownerProfileId: string;
  readonly targetHashtagId: string;
  readonly decision?: HashtagMuteDecision;
  readonly expiresAt?: Temporal.Instant | null;
}) =>
  db
    .insert(HashtagMuteRules)
    .values({
      ownerProfileId,
      targetHashtagId,
      scopes: [HashtagMuteScope.NOTIFICATION],
      decision,
      expiresAt,
    })
    .returning()
    .then(firstOrThrow);

before(async () => {
  await db
    .insert(NotificationRollouts)
    .values({ key: 'QUOTE_NOTIFICATION', activatedAt: Temporal.Now.instant(), enabled: true })
    .onConflictDoNothing();
});

test('generation stays off before activation and while disabled without consuming a judgment', async (t) => {
  const condition = eq(NotificationRollouts.key, 'QUOTE_NOTIFICATION');
  const rollout = await db.select().from(NotificationRollouts).where(condition).then(firstOrThrow);
  t.after(async () => {
    await db
      .insert(NotificationRollouts)
      .values(rollout)
      .onConflictDoUpdate({ target: NotificationRollouts.key, set: rollout });
  });
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);

  await db.delete(NotificationRollouts).where(condition);
  await createQuoteNotification(quote.id);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 0);
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      eq(NotificationQuoteJudgments.quotePostId, quote.id),
    ),
    0,
  );

  await db.insert(NotificationRollouts).values({ ...rollout, enabled: false });
  await createQuoteNotification(quote.id);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 0);
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      eq(NotificationQuoteJudgments.quotePostId, quote.id),
    ),
    0,
  );

  await db.update(NotificationRollouts).set({ enabled: true }).where(condition);
  await createQuoteNotification(quote.id);
  const activated = await db
    .select()
    .from(NotificationRollouts)
    .where(condition)
    .then(firstOrThrow);
  assert.equal(activated.activatedAt.toString(), rollout.activatedAt.toString());
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 1);

  // Disabling generation must not discard the durable result, even after cleanup.
  await db.update(NotificationRollouts).set({ enabled: false }).where(condition);
  await db.delete(Notifications).where(eq(Notifications.sourceId, quote.id));
  await createQuoteNotification(quote.id);
  await db.update(NotificationRollouts).set({ enabled: true }).where(condition);
  await createQuoteNotification(quote.id);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 0);
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      eq(NotificationQuoteJudgments.quotePostId, quote.id),
    ),
    1,
  );
});

test('the fixed DB cutoff excludes the preceding microsecond but includes equality and the next microsecond', async (t) => {
  const condition = eq(NotificationRollouts.key, 'QUOTE_NOTIFICATION');
  const rollout = await db.select().from(NotificationRollouts).where(condition).then(firstOrThrow);
  t.after(async () => {
    await db.update(NotificationRollouts).set(rollout).where(condition);
  });
  const cutoff = Temporal.Instant.from('2026-09-17T00:00:00.123456Z');
  await db.update(NotificationRollouts).set({ activatedAt: cutoff }).where(condition);
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  for (const [offset, expectedOutcome] of [
    [-1, 'EXCLUDED_PRELAUNCH'],
    [0, 'EMITTED'],
    [1, 'EMITTED'],
  ] as const) {
    const quote = await createContentPost(quoteAuthor.id, source.id);
    await db
      .update(Posts)
      .set({ createdAt: cutoff.add({ microseconds: offset }) })
      .where(eq(Posts.id, quote.id));
    await createQuoteNotification(quote.id);
    const judgment = await db
      .select()
      .from(NotificationQuoteJudgments)
      .where(eq(NotificationQuoteJudgments.quotePostId, quote.id))
      .then(firstOrThrow);
    assert.equal(judgment.outcome, expectedOutcome);
    assert.equal(
      await db.$count(Notifications, eq(Notifications.sourceId, quote.id)),
      offset < 0 ? 0 : 1,
    );
  }
});

after(async () => {
  try {
    if (postIds.length > 0) {
      await db
        .delete(NotificationQuoteJudgments)
        .where(inArray(NotificationQuoteJudgments.quotePostId, postIds));
      await db.delete(Notifications).where(inArray(Notifications.sourceId, postIds));
      await db
        .update(Posts)
        .set({ currentContentId: null, repostSourceId: null })
        .where(inArray(Posts.id, postIds));
      await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
      await db.delete(Posts).where(inArray(Posts.id, postIds));
    }
    if (profileIds.length > 0) {
      await db.delete(ProfileBlocks).where(inArray(ProfileBlocks.ownerProfileId, profileIds));
      await db.delete(ProfileMutes).where(inArray(ProfileMutes.ownerProfileId, profileIds));
      await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    }
    if (hashtagIds.length > 0) {
      await db.delete(Hashtags).where(inArray(Hashtags.id, hashtagIds));
    }
    if (instanceIds.length > 0) {
      await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    }
  } finally {
    await pg.end();
  }
});

test('approved Local Quote notifies the Source Author once and keeps its first judgment after deletion', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);

  const notificationIds = await Promise.all([
    createQuoteNotification(quote.id),
    createQuoteNotification(quote.id),
  ]);

  const notifications = await db
    .select()
    .from(Notifications)
    .where(
      and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quote.id)),
    );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.recipientProfileId, sourceAuthor.id);
  assert.deepEqual(notificationIds, [notifications[0]?.id, notifications[0]?.id]);

  const [judgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quote.id));
  assert.equal(judgment?.outcome, 'EMITTED');
  assert.equal(judgment?.representativeNotificationId, notifications[0]?.id);

  await db.delete(Notifications).where(eq(Notifications.id, notifications[0]!.id));
  await createQuoteNotification(quote.id);

  assert.equal(
    await db.$count(
      Notifications,
      and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quote.id)),
    ),
    0,
  );
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      and(
        eq(NotificationQuoteJudgments.quotePostId, quote.id),
        eq(NotificationQuoteJudgments.outcome, 'EMITTED'),
      ),
    ),
    1,
  );
});

test('active Profile Mute and bidirectional Profile Block suppress the first Quote judgment', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const mutedSource = await createContentPost(sourceAuthor.id);
  const mutedQuote = await createContentPost(quoteAuthor.id, mutedSource.id);

  await db.insert(ProfileMutes).values({
    ownerProfileId: sourceAuthor.id,
    targetProfileId: quoteAuthor.id,
  });
  await createQuoteNotification(mutedQuote.id);

  assert.equal(
    await db.$count(
      Notifications,
      and(
        eq(Notifications.kind, NotificationKind.QUOTE),
        eq(Notifications.sourceId, mutedQuote.id),
      ),
    ),
    0,
  );
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      and(
        eq(NotificationQuoteJudgments.quotePostId, mutedQuote.id),
        eq(NotificationQuoteJudgments.outcome, 'SUPPRESSED'),
      ),
    ),
    1,
  );

  const blockedSource = await createContentPost(sourceAuthor.id);
  const blockedQuote = await createContentPost(quoteAuthor.id, blockedSource.id);
  await db.insert(ProfileBlocks).values({
    ownerProfileId: quoteAuthor.id,
    targetProfileId: sourceAuthor.id,
  });
  await createQuoteNotification(blockedQuote.id);

  assert.equal(
    await db.$count(
      Notifications,
      and(
        eq(Notifications.kind, NotificationKind.QUOTE),
        eq(Notifications.sourceId, blockedQuote.id),
      ),
    ),
    0,
  );
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      and(
        eq(NotificationQuoteJudgments.quotePostId, blockedQuote.id),
        eq(NotificationQuoteJudgments.outcome, 'SUPPRESSED'),
      ),
    ),
    1,
  );
});

test('Profile Tag checks Quote Author, then keeps a suppressed first judgment after rule changes', async () => {
  const hashtag = await createHashtag('quote-author-topic', '별도 표시 이름');

  const sourceAuthorWithTag = await createProfile();
  const quoteAuthorWithoutTag = await createProfile();
  await createHashtagMuteRule({
    ownerProfileId: sourceAuthorWithTag.id,
    targetHashtagId: hashtag.id,
  });
  await db
    .insert(ProfileHashtags)
    .values({ profileId: sourceAuthorWithTag.id, hashtagId: hashtag.id });
  const sourceOnly = await createContentPost(sourceAuthorWithTag.id);
  const sourceOnlyQuote = await createContentPost(quoteAuthorWithoutTag.id, sourceOnly.id);
  await createQuoteNotification(sourceOnlyQuote.id);

  const [sourceOnlyNotification] = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.sourceId, sourceOnlyQuote.id));
  assert.equal(sourceOnlyNotification?.recipientProfileId, sourceAuthorWithTag.id);
  assert.equal(sourceOnlyNotification?.kind, NotificationKind.QUOTE);

  const sourceAuthorWithoutTag = await createProfile();
  const quoteAuthorWithTag = await createProfile();
  const rule = await createHashtagMuteRule({
    ownerProfileId: sourceAuthorWithoutTag.id,
    targetHashtagId: hashtag.id,
    decision: HashtagMuteDecision.COLLAPSE,
    expiresAt: Temporal.Now.instant().add({ minutes: 5 }),
  });
  await db
    .insert(ProfileHashtags)
    .values({ profileId: quoteAuthorWithTag.id, hashtagId: hashtag.id });
  const quoteAuthorMatchedSource = await createContentPost(sourceAuthorWithoutTag.id);
  const quoteReplyParent = await createContentPost(sourceAuthorWithoutTag.id);
  const quoteAuthorMatched = await createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId: quoteAuthorWithTag.id,
    replyParentId: quoteReplyParent.id,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);
  postIds.push(quoteAuthorMatched.id);
  await db
    .update(Posts)
    .set({ repostSourceId: quoteAuthorMatchedSource.id })
    .where(eq(Posts.id, quoteAuthorMatched.id));

  await createQuoteNotification(quoteAuthorMatched.id);
  assert.equal(
    await db.$count(Notifications, eq(Notifications.sourceId, quoteAuthorMatched.id)),
    0,
  );
  const [firstJudgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quoteAuthorMatched.id));
  assert.equal(firstJudgment?.outcome, 'SUPPRESSED');

  await db
    .update(HashtagMuteRules)
    .set({ expiresAt: Temporal.Now.instant().subtract({ minutes: 5 }) })
    .where(eq(HashtagMuteRules.id, rule.id));
  await createQuoteNotification(quoteAuthorMatched.id);
  await db
    .delete(ProfileHashtags)
    .where(
      and(
        eq(ProfileHashtags.profileId, quoteAuthorWithTag.id),
        eq(ProfileHashtags.hashtagId, hashtag.id),
      ),
    );
  await db.delete(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id));
  await createQuoteNotification(quoteAuthorMatched.id);

  assert.equal(
    await db.$count(Notifications, eq(Notifications.sourceId, quoteAuthorMatched.id)),
    0,
  );
  const [retainedJudgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quoteAuthorMatched.id));
  assert.equal(retainedJudgment?.quotePostId, firstJudgment?.quotePostId);
  assert.equal(retainedJudgment?.decidedAt.toString(), firstJudgment?.decidedAt.toString());
  assert.equal(retainedJudgment?.outcome, 'SUPPRESSED');
});

test('Hashtag Mute lookup failure rolls back the Quote judgment and retry uses the stored Quote', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);

  await pg.unsafe('ALTER TABLE hashtag_mute_rule RENAME TO hashtag_mute_rule_policy_failure');
  try {
    await assert.rejects(
      createQuoteNotification(quote.id),
      (error: unknown) => {
        assert.match(String(error), /hashtag_mute_rule/);
        return true;
      },
      'Quote Hashtag Mute policy SELECT failure should propagate',
    );
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 0);
    assert.equal(
      await db.$count(
        NotificationQuoteJudgments,
        eq(NotificationQuoteJudgments.quotePostId, quote.id),
      ),
      0,
    );
  } finally {
    await pg.unsafe('ALTER TABLE hashtag_mute_rule_policy_failure RENAME TO hashtag_mute_rule');
  }

  await createQuoteNotification(quote.id);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 1);
  assert.equal(
    await db.$count(
      NotificationQuoteJudgments,
      and(
        eq(NotificationQuoteJudgments.quotePostId, quote.id),
        eq(NotificationQuoteJudgments.outcome, 'EMITTED'),
      ),
    ),
    1,
  );
});

for (const remoteParticipant of ['Quote', 'Source'] as const) {
  test(`a Remote ${remoteParticipant} relation alone cannot consume the first approval judgment`, async () => {
    const sourceAuthor = await createProfile();
    const quoteAuthor = await createProfile();
    const source = await createContentPost(sourceAuthor.id);
    const quote = await createContentPost(quoteAuthor.id, source.id);
    // Only the stored relation is under test; this is not an upstream approval fixture.
    await db
      .update(Instances)
      .set({ kind: InstanceKind.ACTIVITYPUB })
      .where(
        eq(
          Instances.id,
          remoteParticipant === 'Quote' ? quoteAuthor.instanceId : sourceAuthor.instanceId,
        ),
      );

    await createQuoteNotification(quote.id);

    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, quote.id)), 0);
    assert.equal(
      await db.$count(
        NotificationQuoteJudgments,
        eq(NotificationQuoteJudgments.quotePostId, quote.id),
      ),
      0,
    );
  });
}

test('a Quote created before the fixed rollout cutoff is permanently excluded', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);
  const cutoff = Temporal.Now.instant().add({ seconds: 1 });

  await db
    .update(NotificationRollouts)
    .set({ activatedAt: cutoff })
    .where(eq(NotificationRollouts.key, 'QUOTE_NOTIFICATION'));

  try {
    await createQuoteNotification(quote.id);

    assert.equal(
      await db.$count(
        Notifications,
        and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quote.id)),
      ),
      0,
    );
    assert.equal(
      await db.$count(
        NotificationQuoteJudgments,
        and(
          eq(NotificationQuoteJudgments.quotePostId, quote.id),
          eq(NotificationQuoteJudgments.outcome, 'EXCLUDED_PRELAUNCH'),
        ),
      ),
      1,
    );
  } finally {
    await db
      .update(NotificationRollouts)
      .set({ activatedAt: Temporal.Now.instant() })
      .where(eq(NotificationRollouts.key, 'QUOTE_NOTIFICATION'));
  }
});

test('an existing Reply remains the representative and keeps its read state', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);
  const readAt = Temporal.Now.instant();
  const reply = await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.REPLY,
      recipientProfileId: sourceAuthor.id,
      sourceId: quote.id,
      readAt,
    })
    .returning()
    .then(firstOrThrow);

  await createQuoteNotification(quote.id);

  assert.equal(
    await db.$count(
      Notifications,
      and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quote.id)),
    ),
    0,
  );
  const [judgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quote.id));
  assert.equal(judgment?.outcome, 'REPRESENTED_BY_EXISTING');
  assert.equal(judgment?.representativeKind, NotificationKind.REPLY);
  assert.equal(judgment?.representativeNotificationId, reply.id);
  const [preservedReply] = await db
    .select({ readAt: Notifications.readAt })
    .from(Notifications)
    .where(eq(Notifications.id, reply.id));
  assert.equal(preservedReply?.readAt?.toString(), readAt.toString());
});

test('an existing Mention remains the representative when Quote coordination runs', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.id);
  const quote = await createContentPost(quoteAuthor.id, source.id);
  const readAt = Temporal.Instant.from('2026-10-02T02:34:56.654321Z');
  const mention = await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.MENTION,
      recipientProfileId: sourceAuthor.id,
      sourceId: quote.id,
      readAt,
    })
    .returning()
    .then(firstOrThrow);

  assert.equal(await createQuoteNotification(quote.id), null);

  const notifications = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.sourceId, quote.id));
  assert.deepEqual(
    notifications.map(({ kind }) => kind),
    [NotificationKind.MENTION],
  );
  assert.equal(notifications[0]?.id, mention.id);
  assert.equal(notifications[0]?.readAt?.toString(), readAt.toString());

  const [judgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quote.id));
  assert.equal(judgment?.outcome, 'REPRESENTED_BY_EXISTING');
  assert.equal(judgment?.representativeKind, NotificationKind.MENTION);
  assert.equal(judgment?.representativeNotificationId, mention.id);
});
