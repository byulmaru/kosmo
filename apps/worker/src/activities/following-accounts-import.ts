import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { followProfile } from '@kosmo/core/services';
import { visibleProfileWhere } from '@kosmo/core/visibility';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';

type FollowImportedProfileInput = {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

const throwNonRetryableAccountFailure = (error: unknown): never => {
  if (
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof PermissionDeniedError
  ) {
    throw ApplicationFailure.create({
      message: error.message,
      type: error.name,
      nonRetryable: true,
      cause: error,
    });
  }
  throw error;
};

export const resolveImportedLocalProfileActivity = async ({
  handle,
}: {
  readonly handle: string;
}): Promise<string> => {
  try {
    const instance = await resolveConfiguredLocalInstance();
    const profile = await db
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.instanceId, instance.id),
          eq(Profiles.normalizedHandle, handle),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          visibleProfileWhere({ profile: Profiles, instance: Instances }),
        ),
      )
      .limit(1)
      .then(first);

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }
    return profile.id;
  } catch (error) {
    return throwNonRetryableAccountFailure(error);
  }
};

export const followImportedProfileActivity = async (
  input: FollowImportedProfileInput,
): Promise<void> => {
  try {
    await followProfile(input);
  } catch (error) {
    return throwNonRetryableAccountFailure(error);
  }
};
