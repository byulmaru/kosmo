import { first, ProfileBlocks } from '../db';
import { NotFoundError } from '../error';
import { profileBlockPairWhere } from '../visibility/profile-block';
import type { Transaction } from '../db';

export class ProfilePairBlockedError extends NotFoundError {
  constructor() {
    super('Profile not found');
  }
}

export const assertProfilePairIsNotBlocked = async (
  tx: Transaction,
  {
    firstProfileId,
    secondProfileId,
  }: {
    readonly firstProfileId: string;
    readonly secondProfileId: string;
  },
): Promise<void> => {
  const block = await tx
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(profileBlockPairWhere(firstProfileId, secondProfileId))
    .limit(1)
    .then(first);

  if (block) {
    throw new ProfilePairBlockedError();
  }
};
