import { first, ProfileBlocks } from '../db';
import { NotFoundError } from '../error';
import { profileBlockPairWhere } from '../visibility/profile-block';
import type { Transaction } from '../db';

export class ProfilePairBlockedError extends NotFoundError {
  constructor(message = 'Profile not found') {
    super(message);
  }
}

export const assertProfilePairIsNotBlocked = async (
  tx: Transaction,
  {
    firstProfileId,
    secondProfileId,
    notFoundMessage,
  }: {
    readonly firstProfileId: string;
    readonly secondProfileId: string;
    readonly notFoundMessage?: string;
  },
): Promise<void> => {
  const block = await tx
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(profileBlockPairWhere(firstProfileId, secondProfileId))
    .limit(1)
    .then(first);

  if (block) {
    throw new ProfilePairBlockedError(notFoundMessage);
  }
};
