import { PostVisibility } from '@kosmo/core/enums';
import { LOCAL_POST_CREATE_UPDATE_NAME } from '@kosmo/core/temporal/local-post-create';
import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { postCreateEffectsWorkflow } from './create';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type {
  LocalPostCreateInput,
  LocalPostCreateResult,
  LocalPostCreateWorkflowArgs,
} from '@kosmo/core/temporal/local-post-create';
import type * as activities from '../activities';

const workflowArgsSchema = z.strictObject({ requestId: z.uuid() });
const postCreateInputSchema = z.strictObject({
  accountId: z.uuid().optional(),
  bodyText: z.string(),
  contentWarning: z.string().nullable().optional(),
  media: z.array(z.strictObject({ altText: z.string().nullable(), mediaId: z.uuid() })).optional(),
  mentions: z
    .array(
      z.strictObject({
        end: z.number().int(),
        handle: z.string(),
        profileId: z.uuid(),
        relativeHandle: z.string(),
        start: z.number().int(),
      }),
    )
    .optional(),
  origin: z.literal('LOCAL'),
  profileId: z.uuid(),
  replyParentId: z.uuid().optional(),
  repostSourceId: z.uuid().optional(),
  sensitiveMedia: z.boolean().optional(),
  visibility: z.enum(PostVisibility),
});

const { createLocalPostActivity, generateLocalPostIdActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const postCreateEffectsDefinition: WorkflowDefinition<typeof postCreateEffectsWorkflow> = {
  workflow: postCreateEffectsWorkflow,
  workflowIdFromArgs: ({ postId }) => `post-create-effects:${postId}`,
};

const parsePostCreateInput = (value: unknown): LocalPostCreateInput => {
  const result = postCreateInputSchema.safeParse(value);
  if (!result.success) {
    throw ApplicationFailure.nonRetryable(
      result.error.issues[0]?.message ?? 'Local Post creation input is invalid',
      'VALIDATION',
    );
  }
  return result.data;
};

export async function localPostCreateWorkflow(input: LocalPostCreateWorkflowArgs): Promise<void> {
  const workflowArgs = workflowArgsSchema.safeParse(input);
  if (!workflowArgs.success) {
    throw ApplicationFailure.nonRetryable(
      workflowArgs.error.issues[0]?.message ?? 'Local Post creation request is invalid',
      'VALIDATION',
    );
  }

  let updateInputJson: string | undefined;
  let createPromise: Promise<LocalPostCreateResult> | undefined;
  setHandler(
    defineUpdate<LocalPostCreateResult, [LocalPostCreateInput]>(LOCAL_POST_CREATE_UPDATE_NAME),
    async (value) => {
      if (createPromise !== undefined) {
        if (
          updateInputJson !== undefined &&
          JSON.stringify(parsePostCreateInput(value)) !== updateInputJson
        ) {
          throw ApplicationFailure.nonRetryable(
            'Local Post creation request identity was reused',
            'CONFLICT',
          );
        }
        return createPromise;
      }

      createPromise = (async () => {
        const parsedInput = parsePostCreateInput(value);
        updateInputJson = JSON.stringify(parsedInput);
        const postId = await generateLocalPostIdActivity();
        const execution = await createLocalPostActivity(parsedInput, postId);
        if (!execution.ok) {
          throw ApplicationFailure.nonRetryable(
            execution.error.message,
            execution.error.code,
            ...(execution.error.field === undefined ? [] : [execution.error.field]),
          );
        }
        return execution.result;
      })();
      return createPromise;
    },
  );

  await condition(() => createPromise !== undefined);
  const committedResult = await createPromise;
  await condition(allHandlersFinished);
  if (committedResult === undefined) {
    throw new Error('Local Post creation completed without a committed result');
  }
  await runChildWorkflow(postCreateEffectsDefinition, {
    args: [{ origin: 'LOCAL', postId: committedResult.postId }],
    mode: 'execute',
  });
}
