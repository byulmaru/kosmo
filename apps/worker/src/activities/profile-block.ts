import {
  db,
  first,
  Instances,
  Notifications,
  ProfileBlockActivities,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, NotificationKind } from '@kosmo/core/enums';
import { ConflictError, KosmoError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  ensureProfileBlockProtocolActivityInTransaction,
  loadProfileBlockProtocolActivity,
} from '@kosmo/core/services';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  ProfileBlockInput,
  ProfileBlockTransitionResult,
  ProfileUnblockInput,
  ProfileUnblockTransitionResult,
} from '@kosmo/core/temporal/profile-block';

type ProfileFollowRemovalSource = {
  readonly sourceId: string;
  readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

type ProfileBlockUnfollowInput = {
  readonly sourceId: string;
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

type ProfileBlockTransitionFailure = {
  readonly code: 'CONFLICT' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'VALIDATION';
  readonly message: string;
  readonly field?: string;
};

type ProfileBlockTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileBlockTransitionResult;
      /** Post-commit ActivityPub delivery inputs; these do not determine transition success. */
      readonly unfollowInputs: readonly ProfileBlockUnfollowInput[];
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

type ProfileUnblockTransitionExecution =
  | {
      readonly ok: true;
      readonly result: ProfileUnblockTransitionResult;
    }
  | { readonly ok: false; readonly error: ProfileBlockTransitionFailure };

const serializeFailure = (error: KosmoError): ProfileBlockTransitionFailure => {
  const field = 'field' in error && typeof error.field === 'string' ? error.field : undefined;
  return {
    code: error.code,
    message: error.message,
    ...(field === undefined ? {} : { field }),
  };
};

/** The DB transition is the success boundary; post-commit effects are separate. */
export const executeProfileBlockTransitionActivity = async (
  input: ProfileBlockInput,
): Promise<ProfileBlockTransitionExecution> => {
  try {
    return await db.transaction(async (tx) => {
      if (input.ownerProfileId === input.targetProfileId) {
        throw new ConflictError({ message: 'Profile cannot block itself' });
      }

      const participants = await tx
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(or(eq(Profiles.id, input.ownerProfileId), eq(Profiles.id, input.targetProfileId)));
      if (participants.length !== 2) {
        throw new NotFoundError('Profile not found');
      }

      const existingProtocol = input.protocolActivity
        ? await loadProfileBlockProtocolActivity(input.protocolActivity.activityUri, tx)
        : undefined;
      if (existingProtocol && existingProtocol.state !== 'ACTIVE') {
        throw new ConflictError({ message: 'Profile Block activity has already been closed' });
      }

      const inserted = await tx
        .insert(ProfileBlocks)
        .values({
          ownerProfileId: input.ownerProfileId,
          targetProfileId: input.targetProfileId,
        })
        .onConflictDoNothing({
          target: [ProfileBlocks.ownerProfileId, ProfileBlocks.targetProfileId],
        })
        .returning()
        .then(first);
      const profileBlock =
        inserted ??
        (await tx
          .select()
          .from(ProfileBlocks)
          .where(
            and(
              eq(ProfileBlocks.ownerProfileId, input.ownerProfileId),
              eq(ProfileBlocks.targetProfileId, input.targetProfileId),
            ),
          )
          .limit(1)
          .then(first));
      if (!profileBlock) {
        throw new Error('Profile Block not found after insert conflict');
      }

      if (input.protocolActivity && (inserted || existingProtocol)) {
        const protocol = await ensureProfileBlockProtocolActivityInTransaction(
          { ...input.protocolActivity, profileBlockId: profileBlock.id },
          tx,
        );
        if (protocol.state !== 'ACTIVE') {
          throw new ConflictError({ message: 'Profile Block activity has already been closed' });
        }
      }

      const unfollowInputs: ProfileBlockUnfollowInput[] = [];
      if (inserted !== undefined) {
        const [deletedFollows, deletedRequests] = await Promise.all([
          tx
            .delete(ProfileFollows)
            .where(
              or(
                and(
                  eq(ProfileFollows.followerProfileId, input.ownerProfileId),
                  eq(ProfileFollows.followeeProfileId, input.targetProfileId),
                ),
                and(
                  eq(ProfileFollows.followerProfileId, input.targetProfileId),
                  eq(ProfileFollows.followeeProfileId, input.ownerProfileId),
                ),
              ),
            )
            .returning({
              id: ProfileFollows.id,
              followerProfileId: ProfileFollows.followerProfileId,
              followeeProfileId: ProfileFollows.followeeProfileId,
            }),
          tx
            .delete(ProfileFollowRequests)
            .where(
              or(
                and(
                  eq(ProfileFollowRequests.followerProfileId, input.ownerProfileId),
                  eq(ProfileFollowRequests.followeeProfileId, input.targetProfileId),
                ),
                and(
                  eq(ProfileFollowRequests.followerProfileId, input.targetProfileId),
                  eq(ProfileFollowRequests.followeeProfileId, input.ownerProfileId),
                ),
              ),
            )
            .returning({
              id: ProfileFollowRequests.id,
              followerProfileId: ProfileFollowRequests.followerProfileId,
              followeeProfileId: ProfileFollowRequests.followeeProfileId,
            }),
        ]);
        const deletedSources: ProfileFollowRemovalSource[] = [
          ...deletedFollows.map((source) => ({
            sourceId: source.id,
            followerProfileId: source.followerProfileId,
            followeeProfileId: source.followeeProfileId,
            sourceKind: 'FOLLOW' as const,
          })),
          ...deletedRequests.map((source) => ({
            sourceId: source.id,
            followerProfileId: source.followerProfileId,
            followeeProfileId: source.followeeProfileId,
            sourceKind: 'FOLLOW_REQUEST' as const,
          })),
        ];

        const shouldSendActivityPub = async ({
          followerProfileId,
          followeeProfileId,
        }: Pick<ProfileFollowRemovalSource, 'followerProfileId' | 'followeeProfileId'>) => {
          const participants = await tx
            .select({ id: Profiles.id, kind: Instances.kind, state: Instances.state })
            .from(Profiles)
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(inArray(Profiles.id, [followerProfileId, followeeProfileId]));
          const followee = participants.find(({ id }) => id === followeeProfileId);
          return (
            participants.find(({ id }) => id === followerProfileId)?.kind === InstanceKind.LOCAL &&
            followee?.kind === InstanceKind.ACTIVITYPUB &&
            followee.state === InstanceState.ACTIVE
          );
        };

        for (const source of deletedSources) {
          if (source.sourceKind === 'FOLLOW') {
            await tx
              .update(Profiles)
              .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
              .where(eq(Profiles.id, source.followerProfileId));
            await tx
              .update(Profiles)
              .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
              .where(eq(Profiles.id, source.followeeProfileId));
          }

          if (input.origin === 'LOCAL' && (await shouldSendActivityPub(source))) {
            unfollowInputs.push({
              sourceId: source.sourceId,
              followerProfileId: source.followerProfileId,
              followeeProfileId: source.followeeProfileId,
            });
          }
        }

        const followSourceIds = deletedFollows.map(({ id }) => id);
        const followRequestSourceIds = deletedRequests.map(({ id }) => id);

        if (followSourceIds.length > 0) {
          await tx
            .delete(Notifications)
            .where(
              and(
                eq(Notifications.kind, NotificationKind.FOLLOW),
                inArray(Notifications.sourceId, followSourceIds),
              ),
            );
        }
        if (followRequestSourceIds.length > 0) {
          await tx
            .delete(Notifications)
            .where(
              and(
                eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
                inArray(Notifications.sourceId, followRequestSourceIds),
              ),
            );
        }
      }

      const result: ProfileBlockTransitionResult = {
        created: inserted !== undefined,
        profileBlockId: profileBlock.id,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      };
      return { ok: true, result, unfollowInputs };
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};

/** The Unblock transition has no relationship or post-commit effect cleanup. */
export const executeProfileUnblockTransitionActivity = async (
  input: ProfileUnblockInput,
): Promise<ProfileUnblockTransitionExecution> => {
  try {
    return await db.transaction(async (tx) => {
      if (input.protocolActivityUri) {
        const original = await loadProfileBlockProtocolActivity(input.protocolActivityUri, tx);
        if (!original || original.state === 'CLOSED') {
          return {
            ok: true,
            result: {
              removed: false,
              profileBlockId: null,
              ownerProfileId: input.ownerProfileId,
              targetProfileId: input.targetProfileId,
            },
          };
        }
        if (
          original.profileBlockId !== input.profileBlockId ||
          original.ownerProfileId !== input.ownerProfileId ||
          original.targetProfileId !== input.targetProfileId
        ) {
          throw new ValidationError('Profile Block Undo does not match its original relation');
        }
      }
      const profileBlock = await tx
        .delete(ProfileBlocks)
        .where(
          and(
            eq(ProfileBlocks.ownerProfileId, input.ownerProfileId),
            eq(ProfileBlocks.targetProfileId, input.targetProfileId),
            eq(ProfileBlocks.id, input.profileBlockId),
          ),
        )
        .returning()
        .then(first);
      await tx
        .update(ProfileBlockActivities)
        .set({
          state: input.origin === 'ACTIVITYPUB' ? 'CLOSED' : 'CLOSING',
          ...(input.origin === 'ACTIVITYPUB' ? { closedAt: sql`now()` } : {}),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(ProfileBlockActivities.profileBlockId, input.profileBlockId),
            eq(ProfileBlockActivities.ownerProfileId, input.ownerProfileId),
            eq(ProfileBlockActivities.targetProfileId, input.targetProfileId),
            eq(ProfileBlockActivities.state, 'ACTIVE'),
            ...(input.protocolActivityUri
              ? [eq(ProfileBlockActivities.activityUri, input.protocolActivityUri)]
              : []),
          ),
        );
      const result: ProfileUnblockTransitionResult = {
        removed: profileBlock !== undefined,
        profileBlockId: profileBlock?.id ?? null,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      };
      return { ok: true, result };
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      return { ok: false, error: serializeFailure(error) };
    }
    throw error;
  }
};
