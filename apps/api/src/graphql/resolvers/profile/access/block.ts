import { db, firstOrThrowWith, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import type { UserContext } from '@/context';

/** Block management is intentionally restricted to the selected Local actor. */
export const requireSelectedLocalProfile = async (ctx: UserContext) => {
  const profileId = ctx.session?.profileId;
  if (!profileId) {
    throw new PermissionDeniedError('A selected Local Profile is required');
  }

  return db
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(Profiles.id, profileId), eq(Instances.kind, InstanceKind.LOCAL)))
    .limit(1)
    .then(
      firstOrThrowWith(() => new PermissionDeniedError('A selected Local Profile is required')),
    );
};
