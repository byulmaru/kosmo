import { PROFILE_UNBLOCK_UPDATE_NAME } from '@kosmo/core/temporal/profile-block';
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
import type {
  ProfileUnblockInput,
  ProfileUnblockTransitionResult,
} from '@kosmo/core/temporal/profile-block';
import type * as activities from '../activities';

const profileIdSchema = z
  .string({ error: 'Profile Unblock requires non-empty profile IDs' })
  .min(1, 'Profile Unblock requires non-empty profile IDs');

const profileUnblockInputSchema = z.strictObject({
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  profileBlockId: profileIdSchema,
  origin: z.enum(['LOCAL', 'ACTIVITYPUB']).default('LOCAL'),
  protocolActivityUri: profileIdSchema.optional(),
});

const { executeProfileUnblockTransitionActivity, sendProfileBlockUndoActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

type ProfileUnblockTransitionExecution = Awaited<
  ReturnType<typeof executeProfileUnblockTransitionActivity>
>;

const parseProfileUnblockInput = (value: unknown): ProfileUnblockInput => {
  const result = profileUnblockInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Unblock input is invalid',
  );
};

const profileUnblockConflict = (): ApplicationFailure =>
  ApplicationFailure.nonRetryable('Profile Unblock transition is already handled', 'CONFLICT');

const profileUnblockTransitionFailure = (
  error: Extract<ProfileUnblockTransitionExecution, { readonly ok: false }>['error'],
): ApplicationFailure => ApplicationFailure.nonRetryable(error.message, error.code);

/**
 * Removes only the exact Profile Block row ID requested by the caller. The
 * committed result is returned by the Update handler; this Workflow has no
 * post-commit effects to drain.
 */
export async function profileUnblockWorkflow(input: ProfileUnblockInput): Promise<void> {
  parseProfileUnblockInput(input);

  let transitionPromise: ReturnType<typeof executeProfileUnblockTransitionActivity> | undefined;
  let transitionOrigin: ProfileUnblockInput['origin'] | undefined;

  setHandler(
    defineUpdate<ProfileUnblockTransitionResult, [ProfileUnblockInput]>(
      PROFILE_UNBLOCK_UPDATE_NAME,
    ),
    async (command) => {
      if (transitionPromise !== undefined) {
        throw profileUnblockConflict();
      }

      const parsedCommand = parseProfileUnblockInput(command);
      transitionOrigin = parsedCommand.origin;
      const promise = executeProfileUnblockTransitionActivity(parsedCommand);
      transitionPromise = promise;
      const execution = await promise;
      if (!execution.ok) {
        throw profileUnblockTransitionFailure(execution.error);
      }
      return execution.result;
    },
    {
      validator: (command) => {
        parseProfileUnblockInput(command);
        if (transitionPromise !== undefined) {
          throw profileUnblockConflict();
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
  if (!settled.value.ok) {
    throw profileUnblockTransitionFailure(settled.value.error);
  }
  if (settled.value.result.removed && (transitionOrigin ?? input.origin) !== 'ACTIVITYPUB') {
    await Promise.allSettled([
      sendProfileBlockUndoActivity({
        ownerProfileId: settled.value.result.ownerProfileId,
        profileBlockId: settled.value.result.profileBlockId ?? input.profileBlockId,
        targetProfileId: settled.value.result.targetProfileId,
      }),
    ]);
  }
}
