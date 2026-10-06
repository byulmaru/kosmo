import {
  FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES,
  remoteProfileLookupWorkflow,
} from '@kosmo/core/temporal/workflows';
import { localProfileHandleSchema, remoteProfileHandleSchema } from '@kosmo/core/validation';
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
          z.strictObject({ kind: z.literal('local'), handle: localProfileHandleSchema }),
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

type Failure = {
  readonly type?: string | null;
  readonly details?: readonly unknown[] | null;
};

const failuresInChain = (value: unknown): Failure[] => {
  const failures: Failure[] = [];
  const seen = new Set<unknown>();
  let current = value;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    failures.push(current as Error & Failure);
    current = current.cause;
  }
  return failures;
};

const isInitiatorOriginFailure = (failures: readonly Failure[]) =>
  failures.some(
    ({ type, details }) =>
      type === 'RemoteActorMaterializationError' && details?.includes('initiator-origin'),
  );

const accountFailureType = (failures: readonly Failure[]) =>
  failures.find(({ type }) =>
    [
      'ConflictError',
      'NotFoundError',
      'ProfilePairBlockedError',
      'PermissionDeniedError',
      'RemoteActorMaterializationError',
      'RemoteProfileFetchUnavailable',
    ].includes(type ?? ''),
  )?.type;

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

  for (let index = start; index < end; index += 1) {
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
        continue;
      }

      await followImportedProfileActivity({ followerProfileId, followeeProfileId });
    } catch (error) {
      const failures = failuresInChain(error);
      if (isInitiatorOriginFailure(failures)) {
        throw error;
      }

      const failureType = accountFailureType(failures);
      if (!failureType) {
        throw error;
      }

      log.warn('Following import skipped an account', {
        workflowId: parentWorkflowId,
        index,
        reason: failureType,
      });
    }
  }

  if (end < addresses.length) {
    await continueAsNew<typeof followingAccountsImportWorkflow>({
      ...parsed.data,
      afterIndex: end,
    });
  }
}
