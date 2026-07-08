import { db, first, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';

export const resolveLocalActorIdentifierByHandle = async (handle: string) => {
  const localInstance = await resolveConfiguredLocalInstance();

  const profile = await db
    .select({ id: Profiles.id })
    .from(Profiles)
    .where(
      and(
        eq(Profiles.instanceId, localInstance.id),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Profiles.normalizedHandle, normalizeHandle(handle)),
      ),
    )
    .limit(1)
    .then(first);

  return profile?.id ?? null;
};
