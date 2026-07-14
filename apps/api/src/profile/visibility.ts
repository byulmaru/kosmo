import { InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, ne } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type ProfileVisibilityProfile = {
  state: AnyPgColumn;
};

type ProfileVisibilityInstance = {
  state: AnyPgColumn;
};

export const visibleProfileWhere = ({
  instance,
  profile,
}: {
  instance: ProfileVisibilityInstance;
  profile: ProfileVisibilityProfile;
}) => and(eq(profile.state, ProfileState.ACTIVE), ne(instance.state, InstanceState.SUSPENDED))!;
