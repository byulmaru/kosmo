import { sql } from 'drizzle-orm';
import { ProfilePinnedPosts } from './tables';

// A positive, twenty-one-byte fraci integer: legacy rank, null flag, then UUID.
// This virtual initialization is stable, idempotent and includes old writers.
// NULL sorts after every integer, matching PostgreSQL position ASC NULLS LAST.
// All legacy Local ranks are NULL, so their UUID ordering is unchanged.
export const profilePinOrderKey = sql<Buffer>`coalesce(${ProfilePinnedPosts.orderKey}, decode('94', 'hex') || int4send(coalesce(${ProfilePinnedPosts.position}, 2147483647)) || case when ${ProfilePinnedPosts.position} is null then decode('01', 'hex') else decode('00', 'hex') end || uuid_send(${ProfilePinnedPosts.id}))`;
