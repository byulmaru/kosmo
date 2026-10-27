import { sql } from 'drizzle-orm';
import { fraciBinary } from 'fraci';
import { ProfilePinnedPosts } from './tables';
import type { FractionalIndexOf } from 'fraci';

// A positive, twenty-one-byte fraci integer: legacy rank, null flag, then UUID.
// This virtual initialization is stable, idempotent and includes old writers.
// NULL sorts after every integer, matching PostgreSQL position ASC NULLS LAST.
// All legacy Local ranks are NULL, so their UUID ordering is unchanged.
export const profilePinOrderKey = sql<Buffer>`coalesce(${ProfilePinnedPosts.orderKey}, decode('94', 'hex') || int4send(coalesce(${ProfilePinnedPosts.position}, 2147483647)) || case when ${ProfilePinnedPosts.position} is null then decode('01', 'hex') else decode('00', 'hex') end || uuid_send(${ProfilePinnedPosts.id}))`;

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
