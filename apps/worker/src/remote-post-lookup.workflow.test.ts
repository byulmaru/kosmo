import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Mention, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq } from 'drizzle-orm';
import { RemoteDocumentLoaderTypeError } from './activities/remote-document';
import { temporalTestExecutable } from './temporal-test-executable.js';
import type { DocumentLoader } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { temporalClient as TemporalClient } from '@kosmo/core/temporal/client';
import type {
  RemotePostLookupInput,
  RemoteProfileLookupInput,
} from '@kosmo/core/temporal/workflows';
import type * as Fedify from '@kosmo/fedify';
import type { lookupRemotePostActivity as LookupRemotePostActivity } from './activities/remote-post-lookup';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const authorUri = new URL('https://remote.example/users/alice');
const objectUri = new URL('https://objects.example/notes/1');
const requestContextUri = 'https://contexts.example/activitystreams';

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const {
  REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
  remotePostLookupWorkflow,
  remoteProfileLookupWorkflow,
} = await import('@kosmo/core/temporal/workflows');
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let PostMentions: typeof CoreDb.PostMentions;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof Fedify.federation;
let temporalClient: typeof TemporalClient;
let lookupRemotePostActivity: typeof LookupRemotePostActivity;
let seedDatabase: typeof CoreSeed.seedDatabase;

before(async () => {
  ({ ActivityPubActors, db, firstOrThrow, Instances, pg, Posts, PostMentions, Profiles } =
    await import('@kosmo/core/db'));
  ({ seedDatabase } = await import('@kosmo/core/db/seed'));
  ({ federation } = await import('@kosmo/fedify'));
  ({ temporalClient } = await import('@kosmo/core/temporal/client'));
  ({ lookupRemotePostActivity } = await import('./activities/remote-post-lookup'));
});

after(async () => {
  await pg.end();
});

test(
  'Remote Post Workflow validates manual input and bounds fetched Note materialization',
  { timeout: 120_000 },
  async (t) => {
    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    assert.equal(localInstance.kind, InstanceKind.LOCAL);
    assert.equal(localInstance.state, InstanceState.ACTIVE);
    assert.equal(localInstance.canonicalOrigin, publicOrigin);
    const signer = await db
      .insert(Profiles)
      .values({
        displayName: 'Lookup signer',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: 'lookup-signer',
        instanceId: localInstance.id,
        normalizedHandle: 'lookup-signer',
      })
      .returning()
      .then(firstOrThrow);
    const remoteInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: authorUri.origin,
        domain: authorUri.hostname,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const author = await db
      .insert(Profiles)
      .values({
        displayName: 'Remote Alice',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: 'alice',
        instanceId: remoteInstance.id,
        normalizedHandle: 'alice',
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ActivityPubActors).values({
      followersUri: `${authorUri.href}/followers`,
      lastFetchedAt: Temporal.Now.instant(),
      profileId: author.id,
      type: ActivityPubActorType.PERSON,
      uri: authorUri.href,
    });

    let fetchedDocument: unknown;
    let fetchedDocumentUrl = objectUri.href;
    let contextDocument: unknown;
    let loaderFailure: unknown;
    let loaderFailureUrl: string | undefined;
    const loaderCalls: string[] = [];
    const loaderSignals: Array<AbortSignal | undefined> = [];
    const signerLoaderIdentifiers: string[] = [];
    const documentLoader: DocumentLoader = async (url, options) => {
      loaderCalls.push(url);
      loaderSignals.push(options?.signal);
      if (
        loaderFailure !== undefined &&
        (loaderFailureUrl === undefined || url === loaderFailureUrl)
      ) {
        throw loaderFailure;
      }
      return {
        contextUrl: null,
        document:
          url === requestContextUri && contextDocument !== undefined
            ? contextDocument
            : fetchedDocument,
        documentUrl: url === objectUri.href ? fetchedDocumentUrl : url,
      };
    };
    let contextCreationCalls = 0;
    const realContext = federation.createContext(new URL(publicOrigin), undefined);
    const createContextMock = t.mock.method(federation, 'createContext', () => {
      contextCreationCalls += 1;
      return {
        canonicalOrigin: publicOrigin,
        documentLoader,
        getDocumentLoader: async ({ identifier }: { identifier: string }) => {
          signerLoaderIdentifiers.push(identifier);
          return documentLoader;
        },
        parseUri: realContext.parseUri.bind(realContext),
        verifyPortableObject: realContext.verifyPortableObject,
      } as never;
    });
    const authorLookupInputs: RemoteProfileLookupInput[] = [];
    const executeMock = t.mock.method(
      temporalClient.workflow,
      'execute',
      async (workflow: unknown, options: unknown) => {
        if (workflow === remoteProfileLookupWorkflow.workflow) {
          assert.ok(options && typeof options === 'object');
          const input = (options as { args?: RemoteProfileLookupInput[] }).args?.[0];
          assert.ok(input && 'actorUri' in input);
          authorLookupInputs.push(input);
          return author.id;
        }
        return undefined;
      },
    );
    const postCreateEffectsStart = t.mock.method(
      temporalClient.workflow,
      'start',
      async () => undefined as never,
    );

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-post-lookup-${process.pid}`;
    const activityInputs: Array<Parameters<typeof lookupRemotePostActivity>[0]> = [];
    const worker = await Worker.create({
      activities: {
        lookupRemotePostActivity: async (input: Parameters<typeof lookupRemotePostActivity>[0]) => {
          activityInputs.push(input);
          return lookupRemotePostActivity(input);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    const run = (input: unknown, id: string) =>
      environment.client.workflow.execute(remotePostLookupWorkflow.workflow, {
        args: [input as RemotePostLookupInput],
        taskQueue,
        workflowId: `${taskQueue}:${id}`,
        workflowExecutionTimeout: '30 seconds',
      });

    await worker.runUntil(async () => {
      const invalidInputs = [
        { objectUri: 'not-a-url' },
        { objectUri: 'ftp://remote.example/notes/1' },
        { objectUri: objectUri.href, signingProfileId: 'not-a-uuid' },
        { objectUri: objectUri.href, maxDocumentBytes: -1 },
        {
          objectUri: objectUri.href,
          maxDocumentBytes: REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES + 1,
        },
        { objectUri: objectUri.href, unexpected: true },
      ];
      for (const [index, input] of invalidInputs.entries()) {
        await assert.rejects(
          run(input, `invalid-${index}`),
          (error: unknown) =>
            error instanceof WorkflowFailedError &&
            error.cause instanceof ApplicationFailure &&
            error.cause.nonRetryable &&
            error.cause.type === 'RemotePostLookupInputInvalid',
        );
      }
      assert.equal(activityInputs.length, 0);

      const note = new Note({
        attribution: authorUri,
        content: 'Fetched through the bounded loader',
        id: objectUri,
        to: PUBLIC_COLLECTION,
      });
      const noteDocument = await note.toJsonLd({ format: 'expand' });
      fetchedDocument = noteDocument;
      const input = {
        objectUri: objectUri.href,
        signingProfileId: signer.id,
        advertisingActorUri: authorUri.href,
      } satisfies RemotePostLookupInput;
      const expectedBytes = new TextEncoder().encode(JSON.stringify(noteDocument)).byteLength;
      const created = await run(input, 'created');
      assert.deepEqual(created, {
        authorProfileId: author.id,
        documentBytes: expectedBytes,
        postId: (created as { postId: string }).postId,
        status: 'created',
      });
      assert.equal(postCreateEffectsStart.mock.callCount(), 1);
      assert.equal(activityInputs[0]?.maxDocumentBytes, REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES);
      assert.deepEqual(signerLoaderIdentifiers, [signer.id]);
      assert.deepEqual(authorLookupInputs, [
        { actorUri: authorUri.href, contextOrigin: publicOrigin, profileId: signer.id },
      ]);

      const duplicate = await run(input, 'duplicate');
      assert.deepEqual(duplicate, {
        authorProfileId: author.id,
        documentBytes: expectedBytes,
        postId: (created as { postId: string }).postId,
        status: 'duplicate',
      });
      assert.equal(await db.$count(Posts), 1);
      assert.equal(postCreateEffectsStart.mock.callCount(), 1);

      const loadsBeforeInvalidSigner = loaderCalls.length;
      await assert.rejects(
        lookupRemotePostActivity({
          maxDocumentBytes: REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
          objectUri: objectUri.href,
          signingProfileId: author.id,
        }),
        (error: unknown) =>
          error instanceof ApplicationFailure &&
          error.nonRetryable &&
          error.type === 'RemotePostSigningProfileInvalid',
      );
      assert.equal(loaderCalls.length, loadsBeforeInvalidSigner);

      const loadsBeforeZeroBudget = loaderCalls.length;
      const contextsBeforeZeroBudget = contextCreationCalls;
      assert.deepEqual(
        await run({ objectUri: objectUri.href, maxDocumentBytes: 0 }, 'zero-budget'),
        {
          documentBytes: 0,
          reason: 'document_budget_exceeded',
          status: 'rejected',
        },
      );
      assert.equal(loaderCalls.length, loadsBeforeZeroBudget);
      assert.equal(contextCreationCalls, contextsBeforeZeroBudget);

      fetchedDocument = 'oversized';
      const lookupsBeforeBudget = authorLookupInputs.length;
      const budgetResult = await run(
        { objectUri: 'https://objects.example/notes/oversized', maxDocumentBytes: 1 },
        'over-budget',
      );
      assert.deepEqual(budgetResult, {
        documentBytes: new TextEncoder().encode(JSON.stringify(fetchedDocument)).byteLength,
        reason: 'document_budget_exceeded',
        status: 'rejected',
      });
      assert.equal(authorLookupInputs.length, lookupsBeforeBudget);
      assert.equal(await db.$count(Posts), 1);

      fetchedDocument = {
        '@context': requestContextUri,
        attributedTo: authorUri.href,
        content: 'Context budget fixture',
        id: 'https://objects.example/notes/context-over-budget',
        to: 'https://www.w3.org/ns/activitystreams#Public',
        type: 'Note',
      };
      contextDocument = { '@context': { oversized: 'x'.repeat(1_024) } };
      const contextDocumentBytes = new TextEncoder().encode(
        JSON.stringify(contextDocument),
      ).byteLength;
      const contextFixtureBytes = new TextEncoder().encode(
        JSON.stringify(fetchedDocument),
      ).byteLength;
      const lookupsBeforeContextBudget = authorLookupInputs.length;
      const contextBudgetResult = await run(
        {
          objectUri: 'https://objects.example/notes/context-over-budget',
          maxDocumentBytes: 512,
        },
        'context-over-budget',
      );
      assert.deepEqual(contextBudgetResult, {
        documentBytes: contextFixtureBytes + contextDocumentBytes,
        reason: 'document_budget_exceeded',
        status: 'rejected',
      });
      assert.equal(authorLookupInputs.length, lookupsBeforeContextBudget);
      assert.equal(await db.$count(Posts), 1);
      contextDocument = undefined;

      fetchedDocument = noteDocument;
      const lookupsBeforeAdvertiserMismatch = authorLookupInputs.length;
      assert.deepEqual(
        await run(
          {
            advertisingActorUri: 'https://remote.example/users/mallory',
            objectUri: objectUri.href,
          },
          'advertiser-mismatch',
        ),
        { documentBytes: expectedBytes, reason: 'invalid_note', status: 'rejected' },
      );
      assert.equal(authorLookupInputs.length, lookupsBeforeAdvertiserMismatch);
      assert.equal(await db.$count(Posts), 1);

      fetchedDocument = null;
      assert.deepEqual(
        await run({ objectUri: 'https://objects.example/notes/malformed' }, 'malformed'),
        {
          documentBytes: new TextEncoder().encode('null').byteLength,
          reason: 'invalid_note',
          status: 'rejected',
        },
      );

      fetchedDocument = noteDocument;
      fetchedDocumentUrl = 'https://redirect.example/notes/1';
      assert.deepEqual(await run({ objectUri: objectUri.href }, 'cross-origin-redirect'), {
        documentBytes: expectedBytes,
        reason: 'invalid_note',
        status: 'rejected',
      });
      fetchedDocumentUrl = objectUri.href;
      fetchedDocument = await new Note({
        attribution: authorUri,
        content: 'Mismatched identity',
        id: new URL('https://objects.example/notes/other'),
        to: PUBLIC_COLLECTION,
      }).toJsonLd({ format: 'expand' });
      assert.deepEqual(await run({ objectUri: objectUri.href }, 'mismatched-id'), {
        documentBytes: new TextEncoder().encode(JSON.stringify(fetchedDocument)).byteLength,
        reason: 'invalid_note',
        status: 'rejected',
      });
      assert.equal(await db.$count(Posts), 1);

      const recipient = await db
        .insert(Profiles)
        .values({
          displayName: 'Mention recipient',
          followPolicy: ProfileFollowPolicy.OPEN,
          handle: 'mention-recipient',
          instanceId: localInstance.id,
          normalizedHandle: 'mention-recipient',
          state: ProfileState.ACTIVE,
        })
        .returning()
        .then(firstOrThrow);
      assert.notEqual(recipient.id, signer.id);
      const recipientActorUri = new URL(`/ap/actor/${recipient.id}`, publicOrigin);
      await db.insert(ActivityPubActors).values({
        followersUri: `${recipientActorUri.href}/followers`,
        lastFetchedAt: Temporal.Now.instant(),
        profileId: recipient.id,
        type: ActivityPubActorType.PERSON,
        uri: recipientActorUri.href,
      });

      const directObjectUri = new URL('https://objects.example/notes/signed-direct');
      const directNoteDocument = await new Note({
        attribution: authorUri,
        content: 'Signed Mention-only Direct',
        id: directObjectUri,
        tags: [new Mention({ href: recipientActorUri, name: '@mention-recipient' })],
        to: new URL('https://unrelated.example/users/recipient'),
      }).toJsonLd({ format: 'expand' });
      fetchedDocument = directNoteDocument;
      const directDocumentBytes = new TextEncoder().encode(
        JSON.stringify(directNoteDocument),
      ).byteLength;
      const directResult = (await run(
        { objectUri: directObjectUri.href, signingProfileId: signer.id },
        'signed-direct',
      )) as { authorProfileId: string; documentBytes: number; postId: string; status: string };
      assert.equal(directResult.status, 'created');
      assert.equal(directResult.authorProfileId, author.id);
      assert.equal(directResult.documentBytes, directDocumentBytes);
      const directPost = await db
        .select()
        .from(Posts)
        .where(eq(Posts.id, directResult.postId))
        .then(firstOrThrow);
      assert.equal(directPost.visibility, PostVisibility.DIRECT);
      assert.deepEqual(await db.select({ profileId: PostMentions.profileId }).from(PostMentions), [
        { profileId: recipient.id },
      ]);
      assert.equal(postCreateEffectsStart.mock.callCount(), 2);
      assert.deepEqual(authorLookupInputs.at(-1), {
        actorUri: authorUri.href,
        contextOrigin: publicOrigin,
        profileId: signer.id,
      });

      const noMentionObjectUri = new URL('https://objects.example/notes/signed-direct-no-mention');
      const noMentionDocument = await new Note({
        attribution: authorUri,
        content: 'Signer alone cannot authorize Direct',
        id: noMentionObjectUri,
        to: new URL('https://unrelated.example/users/recipient'),
      }).toJsonLd({ format: 'expand' });
      fetchedDocument = noMentionDocument;
      const noMentionDocumentBytes = new TextEncoder().encode(
        JSON.stringify(noMentionDocument),
      ).byteLength;
      const postCountBeforeNoMention = await db.$count(Posts);
      assert.deepEqual(
        await run(
          { objectUri: noMentionObjectUri.href, signingProfileId: signer.id },
          'signed-direct-no-mention',
        ),
        {
          documentBytes: noMentionDocumentBytes,
          reason: 'no_active_local_mention',
          status: 'rejected',
        },
      );
      assert.equal(await db.$count(Posts), postCountBeforeNoMention);
      assert.deepEqual(await db.select({ profileId: PostMentions.profileId }).from(PostMentions), [
        { profileId: recipient.id },
      ]);
      assert.equal(postCreateEffectsStart.mock.callCount(), 2);
      assert.deepEqual(authorLookupInputs.at(-1), {
        actorUri: authorUri.href,
        contextOrigin: publicOrigin,
        profileId: signer.id,
      });

      const portableMentionObjectUri = new URL(
        'https://objects.example/notes/signed-direct-portable-mention',
      );
      fetchedDocument = [
        {
          '@id': portableMentionObjectUri.href,
          '@type': ['https://www.w3.org/ns/activitystreams#Note'],
          'https://www.w3.org/ns/activitystreams#attributedTo': [{ '@id': authorUri.href }],
          'https://www.w3.org/ns/activitystreams#content': [
            { '@value': 'Unverified portable Mention cannot authorize Direct' },
          ],
          'https://www.w3.org/ns/activitystreams#tag': [
            {
              '@id': 'ap+ef61://did:key:z6MkhVPuyvgG1RkMv67azDqDCDERPXVrUg1i3qchXY5EACE3/objects/1',
              '@type': ['https://www.w3.org/ns/activitystreams#Mention'],
              'https://www.w3.org/ns/activitystreams#href': [{ '@id': recipientActorUri.href }],
              'https://www.w3.org/ns/activitystreams#name': [{ '@value': '@mention-recipient' }],
            },
          ],
          'https://www.w3.org/ns/activitystreams#to': [
            { '@id': 'https://unrelated.example/users/recipient' },
          ],
        },
      ];
      const portableMentionDocumentBytes = new TextEncoder().encode(
        JSON.stringify(fetchedDocument),
      ).byteLength;
      const postCountBeforePortableMention = await db.$count(Posts);
      const postMentionCountBeforePortableMention = await db.$count(PostMentions);
      const postCreateEffectsBeforePortableMention = postCreateEffectsStart.mock.callCount();
      assert.deepEqual(
        await run(
          { objectUri: portableMentionObjectUri.href, signingProfileId: signer.id },
          'signed-direct-portable-mention',
        ),
        {
          documentBytes: portableMentionDocumentBytes,
          reason: 'no_active_local_mention',
          status: 'rejected',
        },
      );
      assert.equal(await db.$count(Posts), postCountBeforePortableMention);
      assert.equal(await db.$count(PostMentions), postMentionCountBeforePortableMention);
      assert.equal(postCreateEffectsStart.mock.callCount(), postCreateEffectsBeforePortableMention);

      const directActivityInput = {
        objectUri: 'https://objects.example/notes/network-error',
        maxDocumentBytes: REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
      };
      const networkTypeError = new TypeError('temporary network failure');
      loaderFailure = networkTypeError;
      loaderFailureUrl = directActivityInput.objectUri;
      await assert.rejects(
        lookupRemotePostActivity(directActivityInput),
        (error: unknown) =>
          error instanceof RemoteDocumentLoaderTypeError && error.cause === networkTypeError,
      );

      const contextTypeError = new TypeError('temporary context fetch failure');
      loaderFailure = contextTypeError;
      loaderFailureUrl = requestContextUri;
      fetchedDocument = {
        '@context': requestContextUri,
        attributedTo: authorUri.href,
        content: 'Context load failed',
        id: directActivityInput.objectUri,
        to: 'https://www.w3.org/ns/activitystreams#Public',
        type: 'Note',
      };
      await assert.rejects(
        lookupRemotePostActivity(directActivityInput),
        (error: unknown) =>
          error instanceof Error && (!(error instanceof ApplicationFailure) || !error.nonRetryable),
      );

      assert.equal(
        loaderSignals.every((signal) => signal instanceof AbortSignal),
        true,
      );
      assert.equal(await db.$count(Posts), 2);
      assert.equal(createContextMock.mock.callCount() > 0, true);
      assert.equal(executeMock.mock.callCount() > 0, true);
      assert.equal(executeMock.mock.callCount(), authorLookupInputs.length);
    });
  },
);

const truncateDatabase = async () => {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(databaseName, /^kosmo_test(?:_[a-z0-9_]+)?$/);

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
};
