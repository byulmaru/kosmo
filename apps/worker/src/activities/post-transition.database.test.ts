import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { db, firstOrThrow, Instances, pg, PostContents, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { postQuoteConsentColumns } from '@kosmo/core/services';
import { eq } from 'drizzle-orm';
import {
  createPostTransitionActivity,
  deletePostTransitionActivity,
  reservePostIdActivity,
  verifyPostDeletionActivity,
} from './post-transition';

after(async () => pg.end());

test('Post transaction commit 응답 유실 후 같은 예약 ID로 재시도해도 Post와 Content를 중복 생성하지 않는다', async () => {
  const postId = await reservePostIdActivity();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${postId}.example`,
      canonicalOrigin: `https://${postId}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      instanceId: instance.id,
      handle: postId,
      normalizedHandle: postId,
      displayName: 'writer',
      state: ProfileState.ACTIVE,
      followPolicy: ProfileFollowPolicy.OPEN,
    })
    .returning()
    .then(firstOrThrow);
  const input = {
    admissionId: postId,
    origin: 'LOCAL' as const,
    profileId: profile.id,
    document: postContentDocumentFromText('durable post'),
    visibility: PostVisibility.PUBLIC,
  };
  const first = await createPostTransitionActivity(input, postId);
  const retry = await createPostTransitionActivity(input, postId);
  assert.deepEqual(retry, first);
  assert.equal(first.ok, true);
  assert.equal((await db.select().from(Posts).where(eq(Posts.id, postId))).length, 1);
  assert.equal(
    (await db.select().from(PostContents).where(eq(PostContents.postId, postId))).length,
    1,
  );

  const quoteId = await reservePostIdActivity();
  const quoteAuthor = await db
    .insert(Profiles)
    .values({
      instanceId: instance.id,
      handle: quoteId,
      normalizedHandle: quoteId,
      displayName: 'quote writer',
      state: ProfileState.ACTIVE,
      followPolicy: ProfileFollowPolicy.OPEN,
    })
    .returning()
    .then(firstOrThrow);
  const quote = await createPostTransitionActivity(
    { ...input, admissionId: quoteId, profileId: quoteAuthor.id, repostSourceId: postId },
    quoteId,
  );
  assert.equal(quote.ok, true);

  const removal = { actorProfileId: profile.id, postId, origin: 'LOCAL' as const };
  const verified = await verifyPostDeletionActivity(removal);
  assert.deepEqual(verified, { ok: true, result: { active: true, sourcePostId: null } });
  const deleted = await deletePostTransitionActivity(removal);
  const deletedAt = (await db.select().from(Posts).where(eq(Posts.id, postId)).then(firstOrThrow))
    .deletedAt;
  assert.deepEqual(await deletePostTransitionActivity(removal), deleted);
  const stored = await db.select().from(Posts).where(eq(Posts.id, postId)).then(firstOrThrow);
  assert.equal(stored.state, PostState.DELETED);
  const consent = await db
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.id, quoteId))
    .then(firstOrThrow);
  assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(consent.revision, 2);

  assert.equal(stored.deletedAt?.toString(), deletedAt?.toString());
  assert.deepEqual(await verifyPostDeletionActivity(removal), {
    ok: true,
    result: { active: false, sourcePostId: null },
  });

  const unauthorized = await verifyPostDeletionActivity({
    ...removal,
    actorProfileId: await reservePostIdActivity(),
  });
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) {
    assert.equal(unauthorized.error.code, 'PERMISSION_DENIED');
  }
});
