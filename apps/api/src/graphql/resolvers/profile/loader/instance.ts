import { db, Instances } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type ProfileInstanceRow = Pick<typeof Instances.$inferSelect, 'domain' | 'id' | 'kind'>;

export const profileInstanceByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileInstanceRow, string, true>({
    name: 'profileInstance.byId',
    nullable: true,
    load: (ids) =>
      db
        .select({ domain: Instances.domain, id: Instances.id, kind: Instances.kind })
        .from(Instances)
        .where(inArray(Instances.id, ids)),
    key: (instance) => instance?.id ?? null,
  });
