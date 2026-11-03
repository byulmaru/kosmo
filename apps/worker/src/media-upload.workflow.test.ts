import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  MEDIA_UPLOAD_PUBLISH_UPDATE_NAME,
  mediaUploadWorkflow,
} from '@kosmo/core/temporal/media-upload';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { getClient, startWorkflow, WorkflowRunOperationHandler } from '@temporalio/nexus';
import { Worker } from '@temporalio/worker';
import { HandlerError, operation, service, serviceHandler } from 'nexus-rpc';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import { createMediaUploadTestEndpoint } from './temporal-test-media-endpoint.js';
import {
  MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL,
  MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL,
  mockMediaUploadNexusOperationWorkflow,
} from './test-fixtures/media-upload-nexus-operation';
import type {
  MediaUploadPublishResult,
  MediaUploadResult,
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type { TestWorkflowEnvironment } from '@temporalio/testing';
import type {
  finalizeMediaUploadActivity,
  prepareMediaUploadActivity,
} from './activities/media-upload';
import type { MockMediaUploadOperationInput } from './test-fixtures/media-upload-nexus-operation';

type PreparedUpload = Awaited<ReturnType<typeof prepareMediaUploadActivity>>;
type FinalizeInput = Parameters<typeof finalizeMediaUploadActivity>[0];
type FailurePoint = 'prepare' | 'start' | 'publication';
type Publication = 'completed' | 'processing';

type Deferred = {
  readonly promise: Promise<void>;
  resolve(): void;
};

const deferred = (): Deferred => {
  const result = Promise.withResolvers<void>();
  return {
    promise: result.promise,
    resolve: () => result.resolve(),
  };
};

type Scenario = {
  readonly input: MediaUploadWorkflowInput;
  readonly prepared: PreparedUpload;
  readonly sourceResult: MediaUploadResult;
  readonly publishResult?: MediaUploadPublishResult;
  readonly failurePoint?: FailurePoint;
  readonly waitForHope: boolean;
  readonly prepareEntered: Deferred;
  readonly allowPrepareFailure: Deferred;
  readonly startEntered: Deferred;
  readonly allowStartFailure: Deferred;
  readonly publishEntered: Deferred;
  readonly allowPublicationFailure: Deferred;
  readonly hopeEntered: Deferred;
  readonly allowHope: Deferred;
  readonly legacyPublishEntered: Deferred;
  sourceStarted: boolean;
  sourcePublished: boolean;
  sourceCompleted: boolean;
};

const createScenario = (
  filter: boolean,
  options: {
    readonly legacy?: boolean;
    readonly publication?: Publication;
    readonly failurePoint?: FailurePoint;
    readonly waitForHope?: boolean;
  } = {},
): Scenario => {
  const mediaId = randomUUID();
  const accountId = randomUUID();
  const uploadId = 'u_' + randomUUID();
  const input: MediaUploadWorkflowInput = options.legacy
    ? { mediaId, accountId, applyNightshade: filter }
    : { mediaId, accountId, applyAiProhibitFilter: filter };
  const prepared: PreparedUpload = {
    id: uploadId,
    sourceKey: 'uploads/' + uploadId + '/source',
    contentType: 'image/jpeg',
  };
  const sourceResult: MediaUploadResult = {
    id: uploadId,
    url: 'https://source.example/' + uploadId + '.jpg',
    mediaType: 'image/jpeg',
  };
  const publishResult: MediaUploadPublishResult | undefined =
    options.publication === 'completed'
      ? {
          id: uploadId,
          url: 'https://published.example/' + uploadId + '.webp',
          mediaType: 'image/webp',
          status: 'completed',
        }
      : options.publication === 'processing'
        ? { id: uploadId, status: 'processing' }
        : undefined;

  return {
    input,
    prepared,
    sourceResult,
    ...(publishResult ? { publishResult } : {}),
    ...(options.failurePoint ? { failurePoint: options.failurePoint } : {}),
    waitForHope: options.waitForHope ?? false,
    prepareEntered: deferred(),
    allowPrepareFailure: deferred(),
    startEntered: deferred(),
    allowStartFailure: deferred(),
    publishEntered: deferred(),
    allowPublicationFailure: deferred(),
    hopeEntered: deferred(),
    allowHope: deferred(),
    legacyPublishEntered: deferred(),
    sourceStarted: false,
    sourcePublished: false,
    sourceCompleted: false,
  };
};

type MediaUploadStartInput = PreparedUpload & {
  readonly maxBytes: number;
  readonly maxDimension: number;
};

type HopeInput = {
  readonly id: string;
  readonly hope: {
    readonly algorithm: 'glaze';
    readonly iterations: number;
    readonly intensity: number;
  };
};

type NexusCall = {
  readonly name: 'startUpload' | 'applyHope' | 'publishUpload' | 'publishUploadV2';
  readonly id: string;
  readonly applyAiProhibitFilter?: boolean;
};

const mediaUploadTestService = service('media', {
  startUpload: operation<MediaUploadStartInput, MediaUploadWorkflowResult>(),
  applyHope: operation<HopeInput, { readonly id: string }>(),
  publishUpload: operation<{ readonly id: string }, { readonly id: string }>(),
  publishUploadV2: operation<
    { readonly id: string; readonly applyAiProhibitFilter: boolean },
    MediaUploadPublishResult
  >(),
});

const hasFailureType = (error: unknown, expectedType: string): boolean => {
  const seen = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { readonly cause?: unknown; readonly type?: unknown };
    if (candidate.type === expectedType) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
};

const waitForAcceptedUpdate = async (
  handle: { readonly fetchHistory: () => Promise<unknown> },
  acceptedCount: number,
) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const history = (await handle.fetchHistory()) as { readonly events?: readonly unknown[] };
    const accepted = history.events?.filter((event) => {
      if (!event || typeof event !== 'object') {
        return false;
      }
      const attributes = (
        event as {
          readonly workflowExecutionUpdateAcceptedEventAttributes?: {
            readonly acceptedRequest?: {
              readonly input?: { readonly name?: string };
            };
          };
        }
      ).workflowExecutionUpdateAcceptedEventAttributes;
      return attributes?.acceptedRequest?.input?.name === MEDIA_UPLOAD_PUBLISH_UPDATE_NAME;
    }).length;
    if (accepted !== undefined && accepted >= acceptedCount) {
      return;
    }
    await delay(10);
  }
  throw new Error('Media Upload Update was not accepted: ' + acceptedCount);
};

const completeSourceUpload = async (
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  events: string[],
) => {
  if (!scenario.sourceStarted || scenario.sourceCompleted) {
    return;
  }
  const handle = environment.client.workflow.getHandle('mock-media-upload:' + scenario.prepared.id);
  if (!scenario.sourcePublished) {
    await handle.signal(MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL);
    scenario.sourcePublished = true;
  }
  events.push('source-complete:' + scenario.prepared.id);
  await handle.signal(MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL);
  scenario.sourceCompleted = true;
};

test(
  'Media Upload Update uses V2 publication results and preserves legacy workflow commands',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    let endpointCleanup = () => Promise.resolve();
    t.after(async () => {
      const failures: unknown[] = [];
      try {
        await endpointCleanup();
      } catch (error) {
        failures.push(error);
      }
      try {
        await environment.teardown();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Media Upload workflow test cleanup failed.');
      }
    });

    const completed = createScenario(true, { publication: 'completed' });
    const processing = createScenario(false, { publication: 'processing' });
    const prepareFailure = createScenario(false, { failurePoint: 'prepare' });
    const startFailure = createScenario(false, { failurePoint: 'start' });
    const publicationFailure = createScenario(false, { failurePoint: 'publication' });
    const legacyFalse = createScenario(false, { legacy: true });
    const legacyTrue = createScenario(true, { legacy: true, waitForHope: true });
    const scenarios = [
      completed,
      processing,
      prepareFailure,
      startFailure,
      publicationFailure,
      legacyFalse,
      legacyTrue,
    ];
    const byMediaId = new Map(scenarios.map((scenario) => [scenario.input.mediaId, scenario]));
    const byUploadId = new Map(scenarios.map((scenario) => [scenario.prepared.id, scenario]));
    const events: string[] = [];
    const nexusCalls: NexusCall[] = [];
    const activityCalls: Array<{
      readonly name: 'prepare' | 'finalize';
      readonly mediaId: string;
    }> = [];
    const finalizations: FinalizeInput[] = [];

    const scenarioForMediaId = (mediaId: string): Scenario => {
      const scenario = byMediaId.get(mediaId);
      if (!scenario) {
        throw new Error('Unexpected Media ID: ' + mediaId);
      }
      return scenario;
    };
    const scenarioForUploadId = (uploadId: string): Scenario => {
      const scenario = byUploadId.get(uploadId);
      if (!scenario) {
        throw new Error('Unexpected upload ID: ' + uploadId);
      }
      return scenario;
    };
    const signalSourcePublished = async (scenario: Scenario) => {
      if (!scenario.sourceStarted) {
        throw new Error('Source upload has not started: ' + scenario.prepared.id);
      }
      await getClient()
        .workflow.getHandle('mock-media-upload:' + scenario.prepared.id)
        .signal(MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL);
      scenario.sourcePublished = true;
    };

    const nexusServiceHandler = serviceHandler(mediaUploadTestService, {
      startUpload: new WorkflowRunOperationHandler<
        MediaUploadStartInput,
        MediaUploadWorkflowResult
      >(async (context, input) => {
        const scenario = scenarioForUploadId(input.id);
        nexusCalls.push({ name: 'startUpload', id: input.id });
        events.push('nexus-start:' + input.id);
        if (scenario.failurePoint === 'start') {
          scenario.startEntered.resolve();
          await scenario.allowStartFailure.promise;
          throw new HandlerError('BAD_REQUEST', 'Mock Media Upload start failed', {
            retryableOverride: false,
          });
        }
        const operationInput: MockMediaUploadOperationInput = {
          result: scenario.sourceResult,
          shouldFail: false,
        };
        const handle = await startWorkflow(context, mockMediaUploadNexusOperationWorkflow, {
          workflowId: 'mock-media-upload:' + input.id,
          workflowExecutionTimeout: '25 hours',
          args: [operationInput],
        });
        scenario.sourceStarted = true;
        scenario.startEntered.resolve();
        events.push('nexus-start-ack:' + input.id);
        return handle;
      }),
      applyHope: async (_context, { id }) => {
        const scenario = scenarioForUploadId(id);
        nexusCalls.push({ name: 'applyHope', id });
        events.push('nexus-hope:' + id);
        scenario.hopeEntered.resolve();
        if (scenario.waitForHope) {
          await scenario.allowHope.promise;
        }
        events.push('nexus-hope-ack:' + id);
        return { id };
      },
      publishUpload: async (_context, { id }) => {
        const scenario = scenarioForUploadId(id);
        nexusCalls.push({ name: 'publishUpload', id });
        events.push('nexus-publish-legacy:' + id);
        await signalSourcePublished(scenario);
        scenario.legacyPublishEntered.resolve();
        events.push('nexus-publish-legacy-ack:' + id);
        return { id };
      },
      publishUploadV2: async (_context, { id, applyAiProhibitFilter }) => {
        const scenario = scenarioForUploadId(id);
        nexusCalls.push({ name: 'publishUploadV2', id, applyAiProhibitFilter });
        events.push('nexus-publish-v2:' + id);
        await signalSourcePublished(scenario);
        scenario.publishEntered.resolve();
        if (scenario.failurePoint === 'publication') {
          await scenario.allowPublicationFailure.promise;
          throw new HandlerError('BAD_REQUEST', 'Mock Media Upload publication failed', {
            retryableOverride: false,
          });
        }
        if (!scenario.publishResult) {
          throw new Error('Missing publication result for ' + id);
        }
        return scenario.publishResult;
      },
    });

    const callerTaskQueue = 'media-upload-update-caller-' + process.pid;
    const nexusTaskQueue = 'media-upload-update-nexus-' + process.pid;
    const endpoint = await createMediaUploadTestEndpoint(environment, nexusTaskQueue, t.signal);
    endpointCleanup = endpoint.dispose;
    const nexusWorker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      nexusServices: [nexusServiceHandler],
      taskQueue: nexusTaskQueue,
      workflowsPath: new URL('./test-fixtures/media-upload-nexus-operation.ts', import.meta.url)
        .pathname,
    });
    const callerWorker = await Worker.create({
      activities: {
        prepareMediaUploadActivity: async (
          input: Parameters<typeof prepareMediaUploadActivity>[0],
        ) => {
          const scenario = scenarioForMediaId(input.mediaId);
          activityCalls.push({ name: 'prepare', mediaId: input.mediaId });
          events.push('activity-prepare:' + input.mediaId);
          if (scenario.failurePoint === 'prepare') {
            scenario.prepareEntered.resolve();
            await scenario.allowPrepareFailure.promise;
            throw ApplicationFailure.nonRetryable(
              'Mock Media Upload preparation failed',
              'MediaUploadPrepareFailed',
            );
          }
          return scenario.prepared;
        },
        finalizeMediaUploadActivity: async (input: FinalizeInput) => {
          activityCalls.push({ name: 'finalize', mediaId: input.mediaId });
          events.push('activity-finalize:' + input.mediaId);
          finalizations.push(input);
          return input.result;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue: callerTaskQueue,
      ...testWorkflowSource,
    });
    const nexusWorkerRun = nexusWorker.run();
    void nexusWorkerRun.catch(() => undefined);

    const operationNames = (scenario: Scenario) =>
      nexusCalls.filter(({ id }) => id === scenario.prepared.id).map(({ name }) => name);
    const finalizationsFor = (scenario: Scenario) =>
      finalizations.filter(({ mediaId }) => mediaId === scenario.input.mediaId);
    const startMediaUpload = (scenario: Scenario) =>
      environment.client.workflow.start('mediaUploadWorkflow', {
        args: [scenario.input],
        taskQueue: callerTaskQueue,
        workflowId: mediaUploadWorkflow.workflowIdFromArgs(scenario.input),
      });
    const update = (
      handle: Awaited<ReturnType<typeof startMediaUpload>>,
      filter: boolean,
      updateId = randomUUID(),
    ) =>
      handle.executeUpdate(MEDIA_UPLOAD_PUBLISH_UPDATE_NAME, {
        args: [{ applyAiProhibitFilter: filter }],
        updateId,
      });

    let runUntilFailure: { readonly error: unknown } | undefined;
    try {
      await callerWorker.runUntil(async () => {
        const completedHandle = await startMediaUpload(completed);
        await completed.publishEntered.promise;
        const completedUpdate = await update(completedHandle, true);
        events.push('update-complete:' + completed.prepared.id);
        assert.deepEqual(completedUpdate, completed.publishResult);
        const completedFinalization = finalizationsFor(completed);
        assert.equal(completedFinalization.length, 1);
        assert.equal(completedFinalization[0]?.remoteUploadId, completed.prepared.id);
        assert.deepEqual(completedFinalization[0]?.result, {
          id: completed.prepared.id,
          url: 'https://published.example/' + completed.prepared.id + '.webp',
          mediaType: 'image/webp',
        });
        assert.ok(
          events.indexOf('activity-finalize:' + completed.input.mediaId) <
            events.indexOf('update-complete:' + completed.prepared.id),
        );
        assert.equal(events.includes('source-complete:' + completed.prepared.id), false);
        await completeSourceUpload(environment, completed, events);
        assert.deepEqual(await completedHandle.result(), {
          ...completedFinalization[0]?.result,
          applyAiProhibitFilter: true,
        });
        assert.equal(finalizationsFor(completed).length, 1);

        const processingHandle = await startMediaUpload(processing);
        await processing.publishEntered.promise;
        await assert.rejects(update(processingHandle, true), (error) =>
          hasFailureType(error, 'MediaUploadSelectionConflict'),
        );
        const processingUpdate = await update(processingHandle, false);
        events.push('update-complete:' + processing.prepared.id);
        assert.deepEqual(processingUpdate, processing.publishResult);
        assert.equal(finalizationsFor(processing).length, 0);
        await completeSourceUpload(environment, processing, events);
        assert.deepEqual(await processingHandle.result(), {
          ...processing.sourceResult,
          applyAiProhibitFilter: false,
        });
        assert.equal(finalizationsFor(processing).length, 1);

        const failureScenarios: Array<{
          readonly scenario: Scenario;
          readonly entered: Deferred;
          readonly release: Deferred;
        }> = [
          {
            scenario: prepareFailure,
            entered: prepareFailure.prepareEntered,
            release: prepareFailure.allowPrepareFailure,
          },
          {
            scenario: startFailure,
            entered: startFailure.startEntered,
            release: startFailure.allowStartFailure,
          },
          {
            scenario: publicationFailure,
            entered: publicationFailure.publishEntered,
            release: publicationFailure.allowPublicationFailure,
          },
        ];
        for (const { scenario, entered, release } of failureScenarios) {
          const handle = await startMediaUpload(scenario);
          const updateId = randomUUID();
          const updateResult = update(handle, false, updateId);
          void updateResult.catch(() => undefined);
          await entered.promise;
          await waitForAcceptedUpdate(handle, 1);
          release.resolve();
          await assert.rejects(updateResult);
          await assert.rejects(handle.result(), WorkflowFailedError);
          await completeSourceUpload(environment, scenario, events);
          assert.equal(finalizationsFor(scenario).length, 0);
        }

        const legacyFalseHandle = await startMediaUpload(legacyFalse);
        await legacyFalse.legacyPublishEntered.promise;
        await assert.rejects(update(legacyFalseHandle, true), (error) =>
          hasFailureType(error, 'MediaUploadSelectionConflict'),
        );
        assert.equal(
          operationNames(legacyFalse).some(
            (name) => name === 'applyHope' || name === 'publishUploadV2',
          ),
          false,
        );
        const legacyFalseUpdateId = randomUUID();
        let legacyFalseUpdateSettled = false;
        const legacyFalseUpdate = update(legacyFalseHandle, false, legacyFalseUpdateId).then(
          (result) => {
            legacyFalseUpdateSettled = true;
            return result;
          },
          (error: unknown) => {
            legacyFalseUpdateSettled = true;
            throw error;
          },
        );
        await waitForAcceptedUpdate(legacyFalseHandle, 2);
        await delay(50);
        assert.equal(legacyFalseUpdateSettled, false);
        assert.equal(finalizationsFor(legacyFalse).length, 0);
        await completeSourceUpload(environment, legacyFalse, events);
        assert.deepEqual(await legacyFalseUpdate, {
          status: 'completed',
          ...legacyFalse.sourceResult,
        });
        assert.deepEqual(await legacyFalseHandle.result(), legacyFalse.sourceResult);
        assert.equal(finalizationsFor(legacyFalse).length, 1);

        const legacyTrueHandle = await startMediaUpload(legacyTrue);
        await legacyTrue.hopeEntered.promise;
        const legacyTrueUpdate = await update(legacyTrueHandle, true);
        assert.deepEqual(legacyTrueUpdate, {
          id: legacyTrue.prepared.id,
          status: 'processing',
        });
        assert.equal(events.includes('nexus-publish-legacy:' + legacyTrue.prepared.id), false);
        legacyTrue.allowHope.resolve();
        await legacyTrue.legacyPublishEntered.promise;
        await completeSourceUpload(environment, legacyTrue, events);
        assert.deepEqual(await legacyTrueHandle.result(), legacyTrue.sourceResult);
        assert.equal(finalizationsFor(legacyTrue).length, 1);
        assert.equal('applyAiProhibitFilter' in (await legacyTrueHandle.result()), false);

        assert.deepEqual(operationNames(completed), ['startUpload', 'publishUploadV2']);
        assert.deepEqual(operationNames(processing), ['startUpload', 'publishUploadV2']);
        assert.deepEqual(
          nexusCalls
            .filter(({ id, name }) => id === completed.prepared.id && name === 'publishUploadV2')
            .map(({ applyAiProhibitFilter }) => applyAiProhibitFilter),
          [true],
        );
        assert.deepEqual(
          nexusCalls
            .filter(({ id, name }) => id === processing.prepared.id && name === 'publishUploadV2')
            .map(({ applyAiProhibitFilter }) => applyAiProhibitFilter),
          [false],
        );
        assert.deepEqual(operationNames(prepareFailure), []);
        assert.deepEqual(operationNames(startFailure), ['startUpload']);
        assert.deepEqual(operationNames(publicationFailure), ['startUpload', 'publishUploadV2']);
        assert.deepEqual(operationNames(legacyFalse), ['startUpload', 'publishUpload']);
        assert.deepEqual(operationNames(legacyTrue), ['startUpload', 'applyHope', 'publishUpload']);
        assert.deepEqual(
          activityCalls.filter(({ mediaId }) => mediaId === completed.input.mediaId),
          [
            { name: 'prepare', mediaId: completed.input.mediaId },
            { name: 'finalize', mediaId: completed.input.mediaId },
          ],
        );
        for (const scenario of scenarios) {
          assert.equal(finalizationsFor(scenario).length, scenario.failurePoint ? 0 : 1);
        }
      });
    } catch (error) {
      runUntilFailure = { error };
    }

    const cleanupFailures: unknown[] = [];
    for (const scenario of scenarios) {
      scenario.allowPrepareFailure.resolve();
      scenario.allowStartFailure.resolve();
      scenario.allowPublicationFailure.resolve();
      scenario.allowHope.resolve();
      try {
        await completeSourceUpload(environment, scenario, events);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    try {
      nexusWorker.shutdown();
    } catch (error) {
      cleanupFailures.push(error);
    }
    try {
      await nexusWorkerRun;
    } catch (error) {
      cleanupFailures.push(error);
    }
    try {
      await endpoint.dispose();
    } catch (error) {
      cleanupFailures.push(error);
    }
    if (runUntilFailure) {
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          [runUntilFailure.error, ...cleanupFailures],
          'Media Upload workflow test and cleanup failed.',
        );
      }
      throw runUntilFailure.error;
    }
    if (cleanupFailures.length === 1) {
      throw cleanupFailures[0];
    }
    if (cleanupFailures.length > 1) {
      throw new AggregateError(cleanupFailures, 'Media Upload workflow test cleanup failed.');
    }
  },
);
