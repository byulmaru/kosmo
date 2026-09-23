import { PROFILE_BLOCK_UPDATE_NAME } from '@kosmo/core/temporal/profile-block';
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
import { settleEffects } from './settle-effects';
import type {
  ProfileBlockInput,
  ProfileBlockTransitionResult,
} from '@kosmo/core/temporal/profile-block';
import type * as activities from '../activities';

const profileIdSchema = z
  .string({ error: 'Profile Block requires non-empty profile IDs' })
  .min(1, 'Profile Block requires non-empty profile IDs');

const profileBlockInputSchema = z.strictObject({
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  origin: z.enum(['LOCAL', 'ACTIVITYPUB'], {
    error: 'Profile Block origin is invalid',
  }),
  protocolActivity: z
    .strictObject({
      activityUri: profileIdSchema,
      actorUri: profileIdSchema,
      objectUri: profileIdSchema,
      ownerProfileId: profileIdSchema,
      targetProfileId: profileIdSchema,
      origin: z.enum(['INBOUND', 'OUTBOUND']),
      profileBlockId: profileIdSchema.optional(),
    })
    .optional(),
});

const {
  executeProfileBlockTransitionActivity,
  sendProfileBlockActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

type ProfileBlockTransitionExecution = Awaited<
  ReturnType<typeof executeProfileBlockTransitionActivity>
>;

const parseProfileBlockInput = (value: unknown): ProfileBlockInput => {
  const result = profileBlockInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Block input is invalid',
  );
};

const profileBlockConflict = (): ApplicationFailure =>
  ApplicationFailure.nonRetryable('Profile Block transition is already handled', 'CONFLICT');

const profileBlockTransitionFailure = (
  error: Extract<ProfileBlockTransitionExecution, { readonly ok: false }>['error'],
): ApplicationFailure => ApplicationFailure.nonRetryable(error.message, error.code);

/**
 * Commits one Profile Block transition in an Update handler, then drains the
 * ActivityPub effects retained by the Activity. The Update resolves after the
 * transaction Activity and before these effects complete.
 */
export async function profileBlockWorkflow(input: ProfileBlockInput): Promise<void> {
  // Keep the initial Workflow input fail-closed for direct starts. Normal
  // callers use Update-with-Start, so the command is validated again by the
  // Update validator and handler below.
  const workflowInput = parseProfileBlockInput(input);

  let transitionPromise: ReturnType<typeof executeProfileBlockTransitionActivity> | undefined;
  let transitionOrigin: ProfileBlockInput['origin'] | undefined;

  setHandler(
    defineUpdate<ProfileBlockTransitionResult, [ProfileBlockInput]>(PROFILE_BLOCK_UPDATE_NAME),
    async (command) => {
      const parsedCommand = parseProfileBlockInput(command);
      if (
        parsedCommand.ownerProfileId !== workflowInput.ownerProfileId ||
        parsedCommand.targetProfileId !== workflowInput.targetProfileId ||
        parsedCommand.origin !== workflowInput.origin
      ) {
        throw profileBlockConflict();
      }
      transitionOrigin = parsedCommand.origin;
      const promise =
        transitionPromise === undefined
          ? (transitionPromise = executeProfileBlockTransitionActivity(parsedCommand))
          : executeProfileBlockTransitionActivity(parsedCommand);
      const execution = await promise;
      if (!execution.ok) {
        throw profileBlockTransitionFailure(execution.error);
      }
      return execution.result;
    },
    {
      validator: (command) => {
        const parsedCommand = parseProfileBlockInput(command);
        if (
          parsedCommand.ownerProfileId !== workflowInput.ownerProfileId ||
          parsedCommand.targetProfileId !== workflowInput.targetProfileId ||
          parsedCommand.origin !== workflowInput.origin
        ) {
          throw profileBlockConflict();
        }
      },
    },
  );

  await condition(() => transitionPromise !== undefined);
  const promise = transitionPromise;
  if (promise === undefined) {
    return;
  }
  const [settled] = await Promise.allSettled([promise]);

  await condition(allHandlersFinished);
  if (settled.status === 'rejected') {
    throw settled.reason;
  }
  const execution = settled.value;
  if (!execution.ok) {
    throw profileBlockTransitionFailure(execution.error);
  }
  const effects = [
    ...execution.unfollowInputs.map((input) => sendProfileUnfollowActivity(input)),
    ...((transitionOrigin ?? input.origin) === 'LOCAL' && execution.result.created
      ? [sendProfileBlockActivity(execution.result.profileBlockId, { createIfMissing: true })]
      : []),
  ];
  await settleEffects(effects);
}
