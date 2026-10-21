import '@kosmo/core/polyfill';

import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  ProfileState,
} from '@kosmo/core/enums';
import { KosmoError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  isLocalQuoteAllowedByPolicy,
  loadQuoteConsentForPost,
  loadQuotePostIdentity,
  loadQuoteSourceIdentity,
  ProfilePairBlockedError,
} from '@kosmo/core/services';
import { temporalClient } from '@kosmo/core/temporal/client';
import { postCreateIdentities } from '@kosmo/core/temporal/post-admission';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  federation,
  materializeInboundQuoteSource,
  prepareInboundQuoteDelete,
  prepareInboundQuoteResponse,
  prepareStoredInboundQuote,
  sendLocalPostConsentUpdate,
  sendLocalPostQuoteDecision,
  sendLocalPostQuoteRequest,
} from '@kosmo/fedify';
import { Context } from '@temporalio/activity';
import { WorkflowClient, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createPostPersisted } from '../../../../packages/core/services/post';
import { applyPostQuoteConsent } from '../../../../packages/core/services/post-quote-consent';
import type {
  PreparedPrivateQuoteSource,
  PreparedQuoteConsent,
  QuoteOwnerCommand,
  QuoteOwnerResult,
} from '@kosmo/core/temporal/post-quote-owner';

const fenceClient = new WorkflowClient({
  connection: temporalClient.connection,
  namespace: process.env.TEMPORAL_NAMESPACE!,
  queryRejectCondition: 'NOT_OPEN',
});
const context = () =>
  federation.createContext(
    new URL(process.env.PUBLIC_ORIGIN?.trim() || 'http://127.0.0.1:4173'),
    undefined,
  );
export async function materializeQuoteOwnerSourceActivity(
  command: QuoteOwnerCommand,
): Promise<void> {
  if (command.kind === 'NOTE') {
    await materializeInboundQuoteSource(command, context());
  }
}
export async function prepareQuoteConsentActivity(
  command: QuoteOwnerCommand,
  phase: 'INVALIDATE' | 'VERIFY',
  ambiguousDelete: boolean,
): Promise<PreparedQuoteConsent> {
  if (command.kind === 'NOTE') {
    return prepareStoredInboundQuote(command, context(), phase);
  }
  if (command.kind === 'DELETE') {
    return prepareInboundQuoteDelete(command, context(), ambiguousDelete);
  }
  if (command.kind === 'ACCEPT' || command.kind === 'REJECT') {
    return prepareInboundQuoteResponse(command, context());
  }
  if (command.kind !== 'REQUEST') {
    return { kind: 'NOOP', retryable: false };
  }
  const quote = await loadQuotePostIdentity(db, command.postId);
  const source = await loadQuoteSourceIdentity(db, command.sourcePostId);
  const row = await db.select().from(Posts).where(eq(Posts.id, command.postId)).then(first);
  if (
    !row ||
    !quote ||
    !source?.sourceUri ||
    quote.quoteUri !== command.quoteUri ||
    quote.authorActorUri !== command.quoteAuthorActorUri ||
    source.sourceUri !== command.sourceUri ||
    source.authorActorUri !== command.sourceAuthorActorUri
  ) {
    return { kind: 'NOOP', retryable: false };
  }
  // The current policy is re-evaluated by the transaction Activity under Source lock.
  return {
    kind: 'CHANGE',
    retryable: false,
    change: {
      operation: 'DECIDE',
      result: 'APPROVED',
      issuerActorUri: command.sourceAuthorActorUri,
      expectedStatus: row.quoteConsentStatus,
      expectedApprovalUri: row.quoteConsentApprovalUri,
      expectedRepostSourceId: row.repostSourceId,
      quote: {
        postId: row.id,
        profileId: row.profileId,
        uri: quote.quoteUri,
        authorActorUri: quote.authorActorUri,
      },
      source: {
        postId: command.sourcePostId,
        profileId: source.authorProfileId,
        uri: source.sourceUri,
        authorActorUri: source.authorActorUri,
      },
    },
  };
}

export async function bootstrapQuoteOwnerActivity(postId: string, initialSourcePostId?: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    // An uncommitted first INSERT is invisible to a Quote SELECT. Its Source lock is
    // the recovery barrier until the Quote row exists. Keep this ID in Run input.
    if (initialSourcePostId) {
      await tx
        .select({ id: Posts.id })
        .from(Posts)
        .where(eq(Posts.id, initialSourcePostId))
        .for('update');
    }
    await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)).for('update');
    const row = await tx.select().from(Posts).where(eq(Posts.id, postId)).then(first);
    const quoteIdentity = row ? await loadQuotePostIdentity(tx, postId) : null;
    const sourceId = row?.repostSourceId ?? initialSourcePostId;
    const source = sourceId ? await loadQuoteSourceIdentity(tx, sourceId) : null;
    return {
      status: row?.quoteConsentStatus ?? null,
      approvalUri: row?.quoteConsentApprovalUri ?? null,
      sourcePostId: row?.repostSourceId ?? null,
      targetUri: source?.sourceUri ?? null,
      quoteAuthorActorUri: quoteIdentity?.authorActorUri ?? null,
    };
  });
}
export async function drainQuoteOwnerActivity(
  postId: string,
  initialSourcePostId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    if (initialSourcePostId) {
      await tx
        .select({ id: Posts.id })
        .from(Posts)
        .where(eq(Posts.id, initialSourcePostId))
        .for('update');
    }
    await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)).for('update');
  });
}
export type QuoteWriteInput = {
  readonly command: QuoteOwnerCommand;
  readonly prepared: PreparedQuoteConsent;
  readonly runId: string;
  readonly token: string;
};
export type QuoteWriteResult = QuoteOwnerResult & {
  readonly sourcePostId: string | null;
  readonly approvalUri: string | null;
  readonly matched: boolean;
  readonly quoteAuthorActorUri?: string | null;
  readonly uncertainCommit?: boolean;
  readonly privateSourceCreatedId?: string;
};
class PrivateQuoteSourceRaceError extends Error {}
const LocalFollowerProfiles = alias(Profiles, 'quote_source_local_follower');
const LocalFollowerInstances = alias(Instances, 'quote_source_local_instance');
const privateFollowerIsCurrent = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  source: PreparedPrivateQuoteSource,
) =>
  !!(await tx
    .select({ id: Profiles.id })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followeeProfileId, Profiles.id),
        eq(ProfileFollows.followerProfileId, source.followerProfileId),
      ),
    )
    .innerJoin(
      LocalFollowerProfiles,
      eq(LocalFollowerProfiles.id, ProfileFollows.followerProfileId),
    )
    .innerJoin(
      LocalFollowerInstances,
      eq(LocalFollowerInstances.id, LocalFollowerProfiles.instanceId),
    )
    .where(
      and(
        eq(Profiles.id, source.profileId),
        eq(ActivityPubActors.uri, source.actorUri),
        source.followersUri === null
          ? isNull(ActivityPubActors.followersUri)
          : eq(ActivityPubActors.followersUri, source.followersUri),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(LocalFollowerProfiles.state, ProfileState.ACTIVE),
        eq(LocalFollowerInstances.kind, InstanceKind.LOCAL),
        eq(LocalFollowerInstances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first));

export async function applyQuoteConsentActivity(input: QuoteWriteInput): Promise<QuoteWriteResult> {
  const { command, prepared } = input;
  const execution = Context.current().info.workflowExecution;
  if (execution?.workflowId !== `post-quote:${command.postId}` || execution.runId !== input.runId) {
    throw new Error('Quote write must belong to its current owner Run');
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
      let privateSourceCreatedId: string | undefined;
      let privateSourceId: string | undefined;
      const privateSource = prepared.kind === 'CHANGE' ? prepared.privateSource : undefined;
      if (privateSource) {
        if (!(await privateFollowerIsCurrent(tx, privateSource))) {
          throw new PrivateQuoteSourceRaceError('Private Source follower is no longer current');
        }
        const sourceInput = {
          origin: 'ACTIVITYPUB',
          profileId: privateSource.profileId,
          objectUri: privateSource.objectUri,
          document: privateSource.document,
          media: privateSource.media,
          mentionProfileIds: privateSource.mentionProfileIds,
          visibility: privateSource.visibility,
          publishedAt: privateSource.publishedAt
            ? Temporal.Instant.from(privateSource.publishedAt)
            : null,
          receivedAt: Temporal.Instant.from(privateSource.receivedAt),
        } satisfies Parameters<typeof createPostPersisted>[0];
        let saved: Awaited<ReturnType<typeof createPostPersisted>>;
        try {
          saved = await createPostPersisted(
            privateSource.replyParentId
              ? { ...sourceInput, replyParentId: privateSource.replyParentId }
              : sourceInput,
            privateSource.postId,
            tx,
          );
        } catch (error) {
          if (
            error instanceof ProfilePairBlockedError ||
            !privateSource.replyParentId ||
            !(
              error instanceof NotFoundError ||
              (error instanceof ValidationError && error.field === 'replyParentId')
            )
          ) {
            throw error;
          }
          saved = await createPostPersisted(sourceInput, privateSource.postId, tx);
        }
        const winner = await tx
          .select({ post: Posts, actorUri: ActivityPubActors.uri })
          .from(ActivityPubPosts)
          .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
          .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Posts.profileId))
          .where(eq(ActivityPubPosts.uri, privateSource.objectUri))
          .then(first);
        if (
          !winner ||
          winner.post.profileId !== privateSource.profileId ||
          winner.actorUri !== privateSource.actorUri ||
          winner.post.visibility !== privateSource.visibility ||
          winner.post.state !== PostState.ACTIVE ||
          !winner.post.currentContentId
        ) {
          throw new PrivateQuoteSourceRaceError('Private Source URI winner does not match');
        }
        privateSourceId = winner.post.id;
        if (saved.created) {
          privateSourceCreatedId = winner.post.id;
        }
      }
      const sourceId =
        command.kind === 'INITIALIZE'
          ? command.input.repostSourceId
          : prepared.kind === 'CHANGE'
            ? (privateSourceId ?? prepared.change.source.postId)
            : null;
      if (sourceId) {
        await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, sourceId)).for('share');
      }
      let created = false;
      let existingCreation = false;
      if (command.kind === 'INITIALIZE') {
        if (/^\d{13}:/.test(command.commandId)) {
          const identities = postCreateIdentities({
            ...command.input,
            admissionId: command.commandId.slice(0, 50),
          });
          if (
            identities.postId !== command.postId ||
            identities.contentId !== command.initialContentId
          ) {
            throw new ValidationError(
              'Quote admission payload does not match its original submission',
              {
                field: 'admissionId',
              },
            );
          }
        }
        const exists = await tx
          .select()
          .from(Posts)
          .where(eq(Posts.id, command.postId))
          .then(first);
        if (exists) {
          if (
            command.initialContentId &&
            (exists.currentContentId !== command.initialContentId ||
              exists.state !== PostState.ACTIVE ||
              exists.visibility !== command.input.visibility ||
              exists.replyParentId !== null)
          ) {
            throw new ValidationError(
              'Quote admission payload does not match its original submission',
              {
                field: 'admissionId',
              },
            );
          }
          if (
            exists.profileId !== command.input.profileId ||
            !exists.currentContentId ||
            exists.repostSourceId !== command.input.repostSourceId
          ) {
            throw new Error('Quote create identity does not match');
          }
          existingCreation = true;
        }
        if (!exists) {
          await createPostPersisted(command.input, command.postId, tx, command.initialContentId);
          created = true;
        }
      }
      await tx
        .select({ id: Posts.id })
        .from(Posts)
        .where(eq(Posts.id, command.postId))
        .for('update');
      const current = await fenceClient.withDeadline(Date.now() + 700, () =>
        fenceClient
          .getHandle(execution.workflowId)
          .query<{ runId: string; token: string | null; phase: string }>('quoteOwnerWork'),
      );
      if (
        current.runId !== input.runId ||
        current.token !== input.token ||
        current.phase !== 'WRITE'
      ) {
        throw new Error('Stale Quote owner write');
      }
      if (privateSource && !(await privateFollowerIsCurrent(tx, privateSource))) {
        throw new PrivateQuoteSourceRaceError('Private Source follower changed during owner fence');
      }
      if (privateSourceId) {
        const source = await tx
          .select()
          .from(Posts)
          .where(eq(Posts.id, privateSourceId))
          .then(first);
        if (
          !source ||
          source.visibility !== privateSource?.visibility ||
          source.state !== PostState.ACTIVE ||
          source.profileId !== privateSource?.profileId ||
          !source.currentContentId
        ) {
          throw new PrivateQuoteSourceRaceError('Private Source changed during owner fence');
        }
      }
      let applied = created;
      let matched = created || existingCreation;
      if (prepared.kind === 'CHANGE') {
        let change = privateSourceId
          ? { ...prepared.change, source: { ...prepared.change.source, postId: privateSourceId } }
          : prepared.change;
        if (command.kind === 'REQUEST' && change.operation === 'DECIDE') {
          const allowed = await isLocalQuoteAllowedByPolicy(tx, {
            actorProfileId: change.quote.profileId,
            sourceAuthorProfileId: change.source.profileId,
            sourcePostId: change.source.postId,
          });
          // A changed policy does not revoke a previously approved duplicate Request.
          if (change.expectedStatus === PostQuoteConsentStatus.APPROVED) {
            change = { ...change, result: 'APPROVED' };
          } else {
            change = { ...change, result: allowed ? 'APPROVED' : 'REJECTED' };
          }
        }
        const outcome = await applyPostQuoteConsent(change, tx);
        if (privateSource && !outcome) {
          throw new PrivateQuoteSourceRaceError('Private Source consent CAS did not match');
        }
        matched = outcome !== null;
        applied = outcome?.changed ?? false;
      } else if (prepared.kind === 'PENDING_WITHOUT_SOURCE') {
        const p = prepared.pending;
        const rows = await tx
          .update(Posts)
          .set({
            quoteConsentStatus: PostQuoteConsentStatus.PENDING,
            quoteConsentApprovalUri: p.approvalUri,
          })
          .where(
            and(
              eq(Posts.id, command.postId),
              eq(Posts.state, PostState.ACTIVE),
              eq(Posts.profileId, p.profileId),
              isNull(Posts.repostSourceId),
              p.currentContentId === null
                ? isNull(Posts.currentContentId)
                : eq(Posts.currentContentId, p.currentContentId),
              p.expectedStatus === null
                ? isNull(Posts.quoteConsentStatus)
                : eq(Posts.quoteConsentStatus, p.expectedStatus),
              p.expectedApprovalUri === null
                ? isNull(Posts.quoteConsentApprovalUri)
                : eq(Posts.quoteConsentApprovalUri, p.expectedApprovalUri),
              sql`EXISTS (SELECT 1 FROM ${ActivityPubPosts} ap INNER JOIN ${ActivityPubActors} actor ON actor.profile_id = ${p.profileId} WHERE ap.post_id = ${command.postId} AND ap.uri = ${p.quoteUri} AND actor.uri = ${p.actorUri})`,
            ),
          )
          .returning({ id: Posts.id });
        applied = rows.length > 0;
        matched = applied;
      }
      const row = await tx.select().from(Posts).where(eq(Posts.id, command.postId)).then(first);
      const quoteIdentity = row ? await loadQuotePostIdentity(tx, command.postId) : null;
      // A matching state after completion loss does not prove ownership of the commit.
      // Surface this gap rather than silently marking the effect delivered.
      return {
        postId: command.postId,
        ...(privateSourceCreatedId ? { privateSourceCreatedId } : {}),
        applied,
        matched,
        quoteAuthorActorUri: quoteIdentity?.authorActorUri ?? null,
        retryable: prepared.retryable,
        status: row?.quoteConsentStatus ?? null,
        sourcePostId: row?.repostSourceId ?? null,
        approvalUri: row?.quoteConsentApprovalUri ?? null,
        ...(!applied &&
        Context.current().info.attempt > 1 &&
        (prepared.kind !== 'NOOP' || command.kind === 'INITIALIZE')
          ? { uncertainCommit: true }
          : {}),
      };
    });
  } catch (error) {
    if (error instanceof PrivateQuoteSourceRaceError) {
      const row = await db.select().from(Posts).where(eq(Posts.id, command.postId)).then(first);
      return {
        postId: command.postId,
        status: row?.quoteConsentStatus ?? null,
        applied: false,
        matched: false,
        retryable: false,
        sourcePostId: row?.repostSourceId ?? null,
        approvalUri: row?.quoteConsentApprovalUri ?? null,
        ...(prepared.kind === 'CHANGE' &&
        prepared.privateSource &&
        row?.repostSourceId === prepared.privateSource.postId
          ? { privateSourceCreatedId: prepared.privateSource.postId }
          : {}),
        ...(Context.current().info.attempt > 1 ? { uncertainCommit: true } : {}),
      };
    }
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return {
      postId: command.postId,
      status: null,
      applied: false,
      matched: false,
      retryable: false,
      sourcePostId: null,
      approvalUri: null,
      error: {
        code: error.code,
        message: error.message,
        ...('field' in error && typeof error.field === 'string' ? { field: error.field } : {}),
      },
    };
  }
}
export async function sendQuoteOwnerEffectActivity(
  command: QuoteOwnerCommand,
  result: QuoteWriteResult,
  effectId: string,
): Promise<void> {
  if (result.privateSourceCreatedId && result.sourcePostId === result.privateSourceCreatedId) {
    const postId = result.privateSourceCreatedId;
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start('postCreateEffectsWorkflow', {
          args: [{ postId, origin: 'ACTIVITYPUB' }],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `post-create-effects:${postId}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
        throw error;
      }
      // A completed Source creation effect has the same logical identity on retry.
    }
  }
  if (
    !result.sourcePostId ||
    (!result.applied && !(command.kind === 'REQUEST' && result.matched))
  ) {
    return;
  }
  const effect = {
    postId: command.postId,
    sourcePostId: result.sourcePostId,
    effectId,
    status: result.status ?? undefined,
  };
  if (command.kind === 'REQUEST') {
    await sendLocalPostQuoteDecision({ ...effect, requestUri: command.requestUri });
  } else if (command.kind === 'INITIALIZE') {
    const consent = await loadQuoteConsentForPost(db, command.postId);
    if (consent?.status === PostQuoteConsentStatus.PENDING) {
      await sendLocalPostQuoteRequest(effect);
    }
  } else {
    await sendLocalPostConsentUpdate(effect);
  }
}
