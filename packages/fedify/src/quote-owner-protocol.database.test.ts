import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Note, QuoteAuthorization } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type * as Database from '@kosmo/core/db';
import type * as Protocol from './inbound-quote';

let database: typeof Database;
let protocol: typeof Protocol;
let sourceId: string;
let quoteId: string;
let instanceId: string;
const issuer = 'https://quote-owner-protocol.example/actor/source';
const sourceUri = 'https://quote-owner-protocol.example/note/source';
const quoteUri = 'https://quote-owner-protocol.example/note/quote';
const approvalUri = 'https://quote-owner-protocol.example/authorization/current';

before(async () => {
  database = await import('@kosmo/core/db');
  protocol = await import('./inbound-quote');
  const {
    db,
    Instances,
    Profiles,
    Posts,
    PostContents,
    ActivityPubActors,
    ActivityPubPosts,
    firstOrThrow,
  } = database;
  instanceId = (
    await db
      .insert(Instances)
      .values({
        domain: `${crypto.randomUUID()}.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow)
  ).id;
  const profiles = await db
    .insert(Profiles)
    .values(
      ['source', 'quote'].map((handle) => ({
        instanceId,
        handle,
        normalizedHandle: handle,
        displayName: handle,
        followPolicy: ProfileFollowPolicy.OPEN,
        state: ProfileState.ACTIVE,
      })),
    )
    .returning();
  for (const [index, profile] of profiles.entries()) {
    const post = await db
      .insert(Posts)
      .values({ profileId: profile.id, state: PostState.ACTIVE, visibility: PostVisibility.PUBLIC })
      .returning()
      .then(firstOrThrow);
    const content = await db
      .insert(PostContents)
      .values({
        postId: post.id,
        document: {
          version: 1,
          summary: null,
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'authored link https://example.com' }],
              },
            ],
          },
        },
      })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
    await db.insert(ActivityPubActors).values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: index === 0 ? issuer : 'https://quote-owner-protocol.example/actor/quote',
    });
    await db.insert(ActivityPubPosts).values({
      postId: post.id,
      uri: index === 0 ? sourceUri : quoteUri,
      receivedAt: Temporal.Now.instant(),
    });
    if (index === 0) {
      sourceId = post.id;
    } else {
      quoteId = post.id;
    }
  }
  await db
    .update(Posts)
    .set({
      repostSourceId: sourceId,
      quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      quoteConsentApprovalUri: approvalUri,
    })
    .where(eq(Posts.id, quoteId));
});
after(async () => {
  if (!database) {
    return;
  }
  try {
    await database.db
      .update(database.Posts)
      .set({ currentContentId: null, repostSourceId: null })
      .where(inArray(database.Posts.id, [quoteId, sourceId]));
    await database.db
      .delete(database.PostContents)
      .where(inArray(database.PostContents.postId, [quoteId, sourceId]));
    await database.db.delete(database.Posts).where(inArray(database.Posts.id, [quoteId, sourceId]));
    await database.db.delete(database.Profiles).where(eq(database.Profiles.instanceId, instanceId));
    await database.db.delete(database.Instances).where(eq(database.Instances.id, instanceId));
  } finally {
    await database.pg.end({ timeout: 5 });
  }
});

const command = () => ({
  kind: 'DELETE' as const,
  postId: quoteId,
  commandId: crypto.randomUUID(),
  actorUri: issuer,
  approvalUri,
  activityId: null,
  targetUri: null,
});
const context = (
  load: (url: string) => Promise<{ contextUrl: null; document: unknown; documentUrl: string }>,
) =>
  ({
    contextLoader: getDocumentLoader(),
    documentLoader: load,
    quoteAuthorizationDocumentLoader: load,
  }) as unknown as Context<void>;

test('명확한 ID·target 없는 Delete는 owner의 REVOKE 입력만 준비한다', async () => {
  const prepared = await protocol.prepareInboundQuoteDelete(
    command(),
    context(async () => assert.fail('clear Delete must not dereference')),
    false,
  );
  assert.equal(prepared.kind, 'CHANGE');
  if (prepared.kind === 'CHANGE') {
    assert.equal(prepared.change.operation, 'REVOKE');
  }
  const stored = await database.db
    .select()
    .from(database.Posts)
    .where(eq(database.Posts.id, quoteId))
    .then(database.firstOrThrow);
  assert.equal(stored.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
});

for (const status of [404, 410, 403, 500]) {
  test(`모호한 Delete의 HTTP ${status}는 기존 승인을 변경하지 않는다`, async () => {
    const prepared = await protocol.prepareInboundQuoteDelete(
      command(),
      context(async () => {
        throw Object.assign(new Error(`HTTP ${status}`), {
          response: new Response(null, { status }),
        });
      }),
      true,
    );
    assert.deepEqual(prepared, { kind: 'NOOP', retryable: true });
    const stored = await database.db
      .select()
      .from(database.Posts)
      .where(eq(database.Posts.id, quoteId))
      .then(database.firstOrThrow);
    assert.equal(stored.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
    assert.equal(stored.repostSourceId, sourceId);
  });
}

test('모호한 Delete의 유효한 현재 Authorization은 승인을 유지한다', async () => {
  const document = await new QuoteAuthorization({
    id: new URL(approvalUri),
    attribution: new URL(issuer),
    interactingObject: new URL(quoteUri),
    interactionTarget: new URL(sourceUri),
  }).toJsonLd({ contextLoader: getDocumentLoader(), format: 'expand' });
  const prepared = await protocol.prepareInboundQuoteDelete(
    command(),
    context(async (url) => ({ contextUrl: null, document, documentUrl: url })),
    true,
  );
  assert.deepEqual(prepared, { kind: 'NOOP', retryable: false });
});

test('200 type 불일치와 timeout은 철회 증거로 사용하지 않는다', async () => {
  const document = await new Note({ id: new URL(approvalUri) }).toJsonLd({
    contextLoader: getDocumentLoader(),
    format: 'expand',
  });
  for (const load of [
    async (url: string) => ({ contextUrl: null, document, documentUrl: url }),
    async () => {
      throw new Error('timeout');
    },
  ]) {
    assert.deepEqual(await protocol.prepareInboundQuoteDelete(command(), context(load), true), {
      kind: 'NOOP',
      retryable: true,
    });
  }
});
