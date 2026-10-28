import { fraciBinary } from 'fraci';
import type { FractionalIndexOf } from 'fraci';

const profilePinKeys = fraciBinary({ maxLength: 256, maxRetries: 8 });

export const generateProfilePinKey = (
  before: Uint8Array | null,
  after: Uint8Array | null,
  skip = 0,
): Buffer =>
  Buffer.from(
    profilePinKeys
      .generateKeyBetween(
        before ? (new Uint8Array(before) as FractionalIndexOf<typeof profilePinKeys>) : null,
        after ? (new Uint8Array(after) as FractionalIndexOf<typeof profilePinKeys>) : null,
        skip,
      )
      .next().value,
  );
