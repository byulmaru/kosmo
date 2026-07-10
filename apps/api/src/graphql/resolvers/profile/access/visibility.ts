import { InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type ProfileVisibilityProfile = {
  instanceId: AnyPgColumn;
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
}) =>
  and(
    eq(profile.state, ProfileState.ACTIVE),
    or(isNull(profile.instanceId), ne(instance.state, InstanceState.SUSPENDED)),
  )!;
