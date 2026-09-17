import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  NotificationQuoteJudgments,
  NotificationRollouts,
  Notifications,
  pg,
  PostContents,
  Posts,
  ProfileBlocks,
  ProfileMutes,
  Profiles,
} from '../db';
import {
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

  await Promise.all([createQuoteNotification(quote.id), createQuoteNotification(quote.id)]);

  const notifications = await db
    .select()
    .from(Notifications)
    .where(
      and(eq(Notifications.kind, NotificationKind.QUOTE), eq(Notifications.sourceId, quote.id)),
    );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.recipientProfileId, sourceAuthor.id);

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
  assert.equal(preservedReply?.readAt?.epochMicroseconds, readAt.epochMicroseconds);
});
