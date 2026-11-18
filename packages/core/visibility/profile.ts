import { and, eq, exists, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Instances, Profiles } from '../db';
import { InstanceState, ProfileState } from '../enums';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseHandle } from '../db';
import type { ProfileIdExpression } from './profile-block';

type ProfileVisibilityProfile = {
  readonly state: AnyPgColumn;
};

type ProfileVisibilityInstance = {
  readonly state: AnyPgColumn;
};

const ActiveViewerProfiles = alias(Profiles, 'active_viewer_profile');
const ActiveViewerInstances = alias(Instances, 'active_viewer_instance');

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

/** Returns eligibility for a selected viewer Profile that may have since been disabled. */
export const activeViewerProfileWhere = ({
  db,
  viewerProfileId,
}: {
  readonly db: DatabaseHandle;
  readonly viewerProfileId?: ProfileIdExpression;
}) => {
  if (viewerProfileId === undefined) {
    return undefined;
  }

  return exists(
    db
      .select({ id: ActiveViewerProfiles.id })
      .from(ActiveViewerProfiles)
      .innerJoin(
        ActiveViewerInstances,
        eq(ActiveViewerInstances.id, ActiveViewerProfiles.instanceId),
      )
      .where(
        and(
          eq(ActiveViewerProfiles.id, viewerProfileId),
          visibleProfileWhere({ profile: ActiveViewerProfiles, instance: ActiveViewerInstances }),
        ),
      ),
  );
};
