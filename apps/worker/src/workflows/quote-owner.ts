import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import {
  allHandlersFinished,
  ApplicationFailure,
  CancellationScope,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type {
  QuoteOwnerCommand,
  QuoteOwnerResult,
  QuoteOwnerState,
} from '@kosmo/core/temporal/post-quote-owner';
import type * as activities from '../activities';

const base = { postId: z.uuid(), commandId: z.string().min(1) };
const schema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('NOTE'),
    embeddedSource: z.record(z.string(), z.unknown()).optional(),
    malformed: z.boolean().optional(),
    actorUri: z.url(),
    targetUri: z.union([z.url(), z.literal('')]),
    format: z.enum(['FEP_044F', 'LEGACY']),
    approvalUri: z.url().nullable(),
    authorizationUpdate: z.boolean(),
    duplicateCreate: z.boolean(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('DELETE'),
    actorUri: z.url(),
    approvalUri: z.url(),
    activityId: z.url().nullable(),
    targetUri: z.url().nullable(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('REQUEST'),
    sourcePostId: z.uuid(),
    requestUri: z.url(),
    sourceUri: z.url(),
    sourceAuthorActorUri: z.url(),
    quoteUri: z.url(),
    quoteAuthorActorUri: z.url(),
    quoteAuthorProfileId: z.uuid(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('ACCEPT'),
    approvalUri: z.url(),
    requestUri: z.url(),
    sourceUri: z.url(),
    sourceAuthorActorUri: z.url(),
    quoteUri: z.url(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('REJECT'),
    requestUri: z.url(),
    sourceAuthorActorUri: z.url(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('INITIALIZE'),
    initialContentId: z.uuid().optional(),
    input: z.strictObject({
      origin: z.literal('LOCAL'),
      profileId: z.uuid(),
      accountId: z.uuid().optional(),
      replyParentId: z.uuid().optional(),
      document: z.custom(isPostContentDocumentV1),
      authoredBodyText: z.string().optional(),
      visibility: z.enum(['PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT']),
      quotePolicy: z.enum(['EVERYONE', 'FOLLOWERS', 'AUTHOR']).nullish(),
      repostSourceId: z.uuid(),
      media: z
        .array(z.strictObject({ mediaId: z.uuid(), altText: z.string().nullable() }))
        .optional(),
    }),
  }),
]);
const {
  bootstrapQuoteOwnerActivity,
  drainQuoteOwnerActivity,
  materializeQuoteOwnerSourceActivity,
  prepareQuoteConsentActivity,
  applyQuoteConsentActivity,
  sendQuoteOwnerEffectActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteOwnerWorkflow(input: QuoteOwnerState): Promise<void> {
  if (!z.uuid().safeParse(input.postId).success) {
    throw ApplicationFailure.nonRetryable('Invalid Quote owner identity');
  }
  const queue: QuoteOwnerCommand[] = [...(input.pending ?? [])];
  const results = new Map<string, QuoteOwnerResult>(input.completed ?? []);
  const deferred: QuoteOwnerCommand[] = [];
  const grants = new Set(input.seenApprovalUris ?? []);
  let uncertainHistory = input.uncertainHistory;
  let targetUri = input.targetUri;
  let token: string | null = null;
  let phase = 'BOOTSTRAP';
  let sequence = 0;
  let finish = false;
  let renew = false;
  let closing = false;
  let activeCommandId: string | null = null;
  let latestCommandId = input.latestCommandId;
  let bootstrapped = false;
  let missingHistoricalBinding = false;
  let quoteAuthorActorUri: string | null = null;
  const invalidated = new Set<string>();
  const ignoredBindings = new Set<string>();
  setHandler(defineQuery('quoteOwnerWork'), () => ({ runId: workflowInfo().runId, token, phase }));
  setHandler(defineQuery('quoteOwnerBinding'), () => ({ targetUri }));
  setHandler(defineSignal('finishQuoteOwner'), () => {
    finish = true;
  });
  setHandler(defineSignal('continueQuoteOwner'), () => {
    renew = true;
  });
  setHandler(defineUpdate<QuoteOwnerResult, [QuoteOwnerCommand]>('quoteCommand'), async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success || parsed.data.postId !== input.postId) {
      throw ApplicationFailure.nonRetryable('Invalid Quote owner command');
    }
    const command = parsed.data as QuoteOwnerCommand;
    await condition(() => bootstrapped);
    if (
      command.kind === 'INITIALIZE' &&
      input.initialSourcePostId !== command.input.repostSourceId
    ) {
      throw ApplicationFailure.nonRetryable('Quote creation requires its Source recovery barrier');
    }
    if (finish || closing) {
      throw ApplicationFailure.retryable(
        'Quote owner is draining; retry admission after Run transition',
      );
    }
    if (
      command.commandId === activeCommandId ||
      results.has(command.commandId) ||
      queue.some((c) => c.commandId === command.commandId)
    ) {
      await condition(() => results.has(command.commandId));
      return results.get(command.commandId)!;
    }
    if (command.kind === 'NOTE') {
      if (quoteAuthorActorUri && command.actorUri !== quoteAuthorActorUri) {
        ignoredBindings.add(command.commandId);
      }
      if (!command.targetUri && !command.malformed) {
        throw ApplicationFailure.nonRetryable('Missing Quote Source URI');
      }
      if (missingHistoricalBinding && !command.malformed) {
        throw ApplicationFailure.nonRetryable(
          'Original Quote Source binding requires recovery evidence',
        );
      }
      if (targetUri && targetUri !== command.targetUri) {
        ignoredBindings.add(command.commandId);
      }
      if (command.targetUri && !ignoredBindings.has(command.commandId)) {
        targetUri ??= command.targetUri;
      }
    }
    if (
      command.commandId !== activeCommandId &&
      !results.has(command.commandId) &&
      !queue.some((c) => c.commandId === command.commandId)
    ) {
      if (
        !ignoredBindings.has(command.commandId) &&
        !(
          command.kind === 'NOTE' &&
          command.duplicateCreate &&
          !command.authorizationUpdate &&
          latestCommandId !== undefined
        )
      ) {
        latestCommandId = command.commandId;
        // Fresh intent supersedes delayed reconciliation. A duplicate Create
        // does not cancel the current pending verification.
        for (let i = queue.length - 1; i >= 0; i--) {
          if (results.has(queue[i]!.commandId)) {
            queue.splice(i, 1);
          }
        }
      }
      queue.push(command);
    }
    await condition(() => results.has(command.commandId));
    return results.get(command.commandId)!;
  });
  const bootstrap = await bootstrapQuoteOwnerActivity(input.postId, input.initialSourcePostId);
  uncertainHistory ??= bootstrap.status !== null;
  targetUri ??= bootstrap.targetUri ?? undefined;
  quoteAuthorActorUri = bootstrap.quoteAuthorActorUri;
  missingHistoricalBinding = bootstrap.status !== null && !targetUri;
  bootstrapped = true;
  // Bootstrap DB state does not recover approval generations from a closed Run.
  let previousApproval = bootstrap.approvalUri;
  try {
    while (true) {
      await condition(() => queue.length > 0 || finish || renew);
      if (queue.length === 0) {
        closing = true;
        token = null;
        phase = 'DRAIN';
        await drainQuoteOwnerActivity(input.postId, input.initialSourcePostId);
        await condition(allHandlersFinished);
        if (finish) {
          return;
        }
        if (renew || workflowInfo().continueAsNewSuggested) {
          await continueAsNew<typeof postQuoteOwnerWorkflow>({
            ...input,
            targetUri,
            seenApprovalUris: [...grants],
            uncertainHistory,
            latestCommandId,
            pending: [...queue, ...deferred],
            completed: [...results].slice(-256),
          });
        }
        closing = false;
        continue;
      }
      const command = queue.shift()!;
      if (results.has(command.commandId) && command.commandId !== latestCommandId) {
        continue;
      }
      activeCommandId = command.commandId;
      if (
        command.kind === 'NOTE' &&
        command.authorizationUpdate &&
        !ignoredBindings.has(command.commandId) &&
        !invalidated.has(command.commandId)
      ) {
        phase = 'READ';
        const invalidation = await prepareQuoteConsentActivity(command, 'INVALIDATE', false);
        invalidated.add(command.commandId);
        if (invalidation.kind !== 'NOOP') {
          token = `${command.commandId}:${sequence++}:invalidate`;
          phase = 'WRITE';
          try {
            await applyQuoteConsentActivity({
              command,
              prepared: invalidation,
              runId: workflowInfo().runId,
              token,
            });
          } finally {
            token = null;
            phase = 'DRAIN';
            await drainQuoteOwnerActivity(input.postId, input.initialSourcePostId);
          }
        }
      }
      phase = 'MATERIALIZE';
      if (
        !ignoredBindings.has(command.commandId) &&
        !(command.kind === 'NOTE' && command.malformed)
      ) {
        await materializeQuoteOwnerSourceActivity(command);
      }
      phase = 'READ';
      const ambiguous =
        uncertainHistory || (command.kind === 'DELETE' && grants.has(command.approvalUri));
      const prepared = ignoredBindings.has(command.commandId)
        ? { kind: 'NOOP' as const, retryable: false }
        : await prepareQuoteConsentActivity(command, 'VERIFY', Boolean(ambiguous));
      // Activity completion stores the immutable pre-write proof/CAS input in History.
      token = `${command.commandId}:${sequence++}:apply`;
      phase = 'WRITE';
      let result: Awaited<ReturnType<typeof applyQuoteConsentActivity>>;
      try {
        result = await applyQuoteConsentActivity({
          command,
          prepared,
          runId: workflowInfo().runId,
          token,
        });
      } finally {
        token = null;
        phase = 'DRAIN';
        await drainQuoteOwnerActivity(input.postId, input.initialSourcePostId);
      }
      if (result.uncertainCommit) {
        // Re-establish current truth after a commit/completion gap. Never infer
        // ownership from an equal status/URI, or repeat the old proof blindly.
        uncertainHistory = true;
        phase = 'READ';
        const fresh = await prepareQuoteConsentActivity(command, 'VERIFY', true);
        token = `${command.commandId}:${sequence++}:reconcile`;
        phase = 'WRITE';
        try {
          const reconciled = await applyQuoteConsentActivity({
            command,
            prepared: fresh,
            runId: workflowInfo().runId,
            token,
          });
          result = {
            ...reconciled,
            applied:
              reconciled.applied ||
              (reconciled.matched && (fresh.kind === 'CHANGE' || command.kind === 'INITIALIZE')) ||
              (prepared.kind === 'CHANGE' &&
                prepared.change.operation === 'REVOKE' &&
                reconciled.status === 'REVOKED' &&
                reconciled.approvalUri === result.approvalUri),
            retryable:
              reconciled.retryable ||
              (fresh.kind === 'NOOP' &&
                command.kind !== 'INITIALIZE' &&
                !(
                  prepared.kind === 'CHANGE' &&
                  prepared.change.operation === 'REVOKE' &&
                  reconciled.status === 'REVOKED'
                )),
          };
        } finally {
          token = null;
          phase = 'DRAIN';
          await drainQuoteOwnerActivity(input.postId, input.initialSourcePostId);
        }
      }
      quoteAuthorActorUri = result.quoteAuthorActorUri ?? quoteAuthorActorUri;
      if (result.status === 'APPROVED' && result.approvalUri) {
        if (
          grants.has(result.approvalUri) ||
          (prepared.kind === 'CHANGE' &&
            prepared.change.expectedStatus === 'REVOKED' &&
            prepared.change.expectedApprovalUri === result.approvalUri)
        ) {
          uncertainHistory = true;
        }
        previousApproval = result.approvalUri;
      }
      if (result.status === 'REVOKED' && previousApproval) {
        grants.add(previousApproval);
      }
      results.set(command.commandId, result);
      phase = 'EFFECT';
      await settleEffects([
        sendQuoteOwnerEffectActivity(
          command,
          result,
          `quote:${input.postId}:command:${command.commandId}:state:${result.status}:approval:${encodeURIComponent(result.approvalUri ?? 'local')}`,
        ),
      ]);
      activeCommandId = null;
      phase = 'IDLE';
      if (result.retryable && !finish && !renew && command.commandId === latestCommandId) {
        await condition(() => queue.length > 0 || finish || renew, '30 seconds');
        if (
          !finish &&
          !renew &&
          command.commandId === latestCommandId &&
          !queue.some((c) => c.commandId === command.commandId)
        ) {
          queue.push(command);
        }
      }
      if (sequence >= 100 || workflowInfo().continueAsNewSuggested) {
        renew = true;
      }
      if (renew) {
        closing = true;
        if (
          result.retryable &&
          command.commandId === latestCommandId &&
          !queue.some((c) => c.commandId === command.commandId)
        ) {
          deferred.push(command);
        }
      }
    }
  } finally {
    token = null;
    phase = 'DRAIN';
    await CancellationScope.nonCancellable(() =>
      drainQuoteOwnerActivity(input.postId, input.initialSourcePostId),
    );
  }
}
