import {
  FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES,
  remoteProfileLookupWorkflow,
} from '@kosmo/core/temporal/workflows';
import { profileHandleSchema, remoteProfileHandleSchema } from '@kosmo/core/validation';
import {
  ApplicationFailure,
  continueAsNew,
  log,
  proxyActivities,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { settleEffects } from './settle-effects';
import type {
  FollowingAccountsImportInput,
  RemoteProfileLookupInput,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const BATCH_SIZE = 50;

const { followImportedProfileActivity, resolveImportedLocalProfileActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const followingAccountsImportInputSchema = z
  .strictObject({
    followerProfileId: z.uuid(),
    addresses: z
      .array(
        z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('local'), handle: profileHandleSchema }),
          z.strictObject({
            kind: z.literal('remote'),
            handle: remoteProfileHandleSchema,
            domain: z
              .string()
              .min(1)
              .refine((domain) => domain === domain.toLowerCase()),
          }),
        ]),
      )
      .min(1)
      .max(FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES),
    afterIndex: z.number().int().nonnegative().optional(),
  })
  .refine(
    ({ addresses, afterIndex }) => (afterIndex ?? 0) <= addresses.length,
  ) satisfies z.ZodType<FollowingAccountsImportInput>;

const accountFailureType = (error: unknown): string | undefined => {
  const seen = new Set<unknown>();
  let current = error;
  let failureType: string | undefined;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current instanceof ApplicationFailure) {
      const type = current.type ?? '';
      if (
        type === 'RemoteActorMaterializationError' &&
        current.details?.includes('initiator-origin')
      ) {
        return undefined;
      }

      if (
        failureType === undefined &&
        [
          'ConflictError',
          'NotFoundError',
          'ProfilePairBlockedError',
          'PermissionDeniedError',
          'RemoteActorMaterializationError',
          'RemoteProfileFetchUnavailable',
        ].includes(type)
      ) {
        failureType = type;
      }
    }
    current = current.cause;
  }
  return failureType;
};

export async function followingAccountsImportWorkflow(
  input: FollowingAccountsImportInput,
): Promise<void> {
  const parsed = followingAccountsImportInputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Following accounts import input is invalid',
    );
  }

  const { addresses, followerProfileId } = parsed.data;
  const parentWorkflowId = workflowInfo().workflowId;
  const start = parsed.data.afterIndex ?? 0;
  const end = Math.min(start + BATCH_SIZE, addresses.length);

  const processAddress = async (index: number): Promise<void> => {
    const address = addresses[index]!;
    try {
      const followeeProfileId =
        address.kind === 'local'
          ? await resolveImportedLocalProfileActivity({ handle: address.handle })
          : await runChildWorkflow(
              {
                ...remoteProfileLookupWorkflow,
                workflowIdFromArgs: (lookupInput: RemoteProfileLookupInput) =>
                  `${remoteProfileLookupWorkflow.workflowIdFromArgs(lookupInput)}:following-import:${parentWorkflowId}:${index}`,
              },
              {
                mode: 'execute',
                args: [
                  {
                    domain: address.domain,
                    handle: address.handle,
                    profileId: followerProfileId,
                  },
                ],
              },
            );

      if (followeeProfileId === null) {
        log.warn('Following import skipped an unresolved account', {
          workflowId: parentWorkflowId,
          index,
          reason: 'NotFoundError',
        });
        return;
      }

      await followImportedProfileActivity({ followerProfileId, followeeProfileId });
    } catch (error) {
      const failureType = accountFailureType(error);
      if (!failureType) {
        throw error;
      }

      log.warn('Following import skipped an account', {
        workflowId: parentWorkflowId,
        index,
        reason: failureType,
      });
    }
  };

  await settleEffects(
    Array.from({ length: end - start }, (_, offset) => processAddress(start + offset)),
  );

  if (end < addresses.length) {
    await continueAsNew<typeof followingAccountsImportWorkflow>({
      ...parsed.data,
      afterIndex: end,
    });
  }
}
