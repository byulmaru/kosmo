import { and, eq, ne } from 'drizzle-orm';
import { InstanceState, ProfileState } from '../enums';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type ProfileVisibilityProfile = {
  readonly state: AnyPgColumn;
};

type ProfileVisibilityInstance = {
  readonly state: AnyPgColumn;
};

/**
 * Returns the canonical visibility predicate for a Profile and its Instance.
 *
 * This predicate intentionally has no viewer or membership input. Consumers
 * that need account authorization must compose that condition separately.
 */
export const visibleProfileWhere = ({
  instance,
  profile,
}: {
  readonly instance: ProfileVisibilityInstance;
  readonly profile: ProfileVisibilityProfile;
}) => and(eq(profile.state, ProfileState.ACTIVE), ne(instance.state, InstanceState.SUSPENDED))!;
