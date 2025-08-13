import { db, ProfileActivityPubActors } from '@kosmo/db';
import { inArray } from 'drizzle-orm';
import type { Context } from '@/context';

export const ProfileActivityPubActorByProfileIdLoader = (ctx: Context) =>
  ctx.loader({
    name: 'ProfileActivityPubActor(ProfileId)',
    nullable: true,
    load: (profileIds) =>
      db
        .select()
        .from(ProfileActivityPubActors)
        .where(inArray(ProfileActivityPubActors.profileId, profileIds)),

    key: (profileActivityPubActor) => profileActivityPubActor?.profileId,
  });
