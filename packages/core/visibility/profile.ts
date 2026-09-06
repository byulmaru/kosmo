import { and, eq, ne } from 'drizzle-orm';
import { InstanceState, ProfileState } from '../enums';
import { profileBlockVisibilityWhere } from './profile-block';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseHandle } from '../db';
import type { ProfileIdExpression } from './profile-block';

type ProfileVisibilityProfile = {
  readonly id: ProfileIdExpression;
  readonly state: AnyPgColumn;
};

type ProfileVisibilityInstance = {
  readonly state: AnyPgColumn;
};

/**
 * Returns the canonical visibility predicate for a Profile and its Instance.
 *
 * Consumers that need account authorization still compose that condition
 * separately; an optional viewer applies only the symmetric Profile Block
 * pair policy.
 */
export const visibleProfileWhere = ({
  instance,
  profile,
  database,
  viewerProfileId,
}: {
  readonly instance: ProfileVisibilityInstance;
  readonly profile: ProfileVisibilityProfile;
  readonly database?: DatabaseHandle;
  readonly viewerProfileId?: ProfileIdExpression | null;
}) =>
  and(
    eq(profile.state, ProfileState.ACTIVE),
    ne(instance.state, InstanceState.SUSPENDED),
    database && viewerProfileId !== undefined && viewerProfileId !== null
      ? profileBlockVisibilityWhere({
          database,
          firstProfileId: viewerProfileId,
          secondProfileId: profile.id,
        })
      : undefined,
  )!;
