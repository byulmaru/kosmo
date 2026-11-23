import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceState } from '@kosmo/core/enums';
import { and, asc, count, desc, eq, gt, ilike, lt, or } from 'drizzle-orm';
import { z } from 'zod';

export const instanceIdSchema = z.uuid();
export const instanceStateSchema = z.enum([
  InstanceState.ACTIVE,
  InstanceState.UNRESPONSIVE,
  InstanceState.SUSPENDED,
]);
export const instanceCursorSchema = z
  .string()
  .regex(/^(0|[1-9]\d*):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  .transform((value) => {
    const [profileCount, id] = value.split(':');
    return { id: id!, profileCount: Number(profileCount) };
  })
  .refine(
    ({ id, profileCount }) =>
      Number.isSafeInteger(profileCount) && instanceIdSchema.safeParse(id).success,
  );

export type InstanceReadState = z.infer<typeof instanceStateSchema>;
export type InstanceListCursor = z.infer<typeof instanceCursorSchema>;

export interface InstanceListOptions {
  cursor?: InstanceListCursor;
  direction?: 'next' | 'previous';
  q?: string;
  state?: InstanceReadState;
}

export interface InstanceListRow {
  id: string;
  domain: string;
  state: InstanceReadState;
  profileCount: number;
}

const pageSize = 50;

const instancesWithProfileCounts = db
  .select({
    id: Instances.id,
    domain: Instances.domain,
    state: Instances.state,
    profileCount: count(Profiles.id).as('profile_count'),
  })
  .from(Instances)
  .leftJoin(Profiles, eq(Profiles.instanceId, Instances.id))
  .groupBy(Instances.id)
  .as('instances_with_profile_counts');

const instanceFiltersWhere = ({ q, state }: InstanceListOptions) => {
  const search = q?.trim();
  const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : undefined;

  return and(
    state ? eq(instancesWithProfileCounts.state, state) : undefined,
    pattern ? ilike(instancesWithProfileCounts.domain, pattern) : undefined,
  );
};

const afterInstanceCursor = (
  cursor: Pick<InstanceListRow, 'id' | 'profileCount'>,
  direction: 'next' | 'previous',
) => {
  const compare = direction === 'next' ? lt : gt;

  return or(
    compare(instancesWithProfileCounts.profileCount, cursor.profileCount),
    and(
      eq(instancesWithProfileCounts.profileCount, cursor.profileCount),
      compare(instancesWithProfileCounts.id, cursor.id),
    ),
  );
};

const hasInstanceAfterCursor = async (
  filters: InstanceListOptions,
  cursor: Pick<InstanceListRow, 'id' | 'profileCount'>,
  direction: 'next' | 'previous',
) => {
  const row = await db
    .select({ id: instancesWithProfileCounts.id })
    .from(instancesWithProfileCounts)
    .where(and(instanceFiltersWhere(filters), afterInstanceCursor(cursor, direction)))
    .limit(1)
    .then(first);

  return Boolean(row);
};

const cursorForInstance = ({ id, profileCount }: Pick<InstanceListRow, 'id' | 'profileCount'>) =>
  `${profileCount}:${id}`;

export const listInstances = async ({
  cursor,
  direction = 'next',
  q,
  state,
}: InstanceListOptions = {}) => {
  const filters = { q, state };
  const rows = await db
    .select({
      id: instancesWithProfileCounts.id,
      domain: instancesWithProfileCounts.domain,
      state: instancesWithProfileCounts.state,
      profileCount: instancesWithProfileCounts.profileCount,
    })
    .from(instancesWithProfileCounts)
    .where(
      and(
        instanceFiltersWhere(filters),
        cursor ? afterInstanceCursor(cursor, direction) : undefined,
      ),
    )
    .orderBy(
      direction === 'previous'
        ? asc(instancesWithProfileCounts.profileCount)
        : desc(instancesWithProfileCounts.profileCount),
      direction === 'previous'
        ? asc(instancesWithProfileCounts.id)
        : desc(instancesWithProfileCounts.id),
    )
    .limit(pageSize + 1);

  const hasMoreInDirection = rows.length > pageSize;
  const instances =
    direction === 'previous' ? rows.slice(0, pageSize).reverse() : rows.slice(0, pageSize);
  const firstInstance = instances.at(0);
  const lastInstance = instances.at(-1);
  const previousPageExists =
    direction === 'previous'
      ? hasMoreInDirection
      : cursor && firstInstance
        ? await hasInstanceAfterCursor(filters, firstInstance, 'previous')
        : false;
  const nextPageExists =
    direction === 'next'
      ? hasMoreInDirection
      : lastInstance
        ? await hasInstanceAfterCursor(filters, lastInstance, 'next')
        : false;

  return {
    instances,
    previousCursor: previousPageExists && firstInstance ? cursorForInstance(firstInstance) : null,
    nextCursor: nextPageExists && lastInstance ? cursorForInstance(lastInstance) : null,
  } satisfies {
    instances: InstanceListRow[];
    previousCursor: string | null;
    nextCursor: string | null;
  };
};
