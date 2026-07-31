import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { profileHandleSchema } from '@kosmo/core/validation';
import {
  federation,
  findOrMaterializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { captureUnexpectedError } from '@/sentry';
import { Profile, ProfileConnection } from '../ref';

type ProfileRow = typeof Profiles.$inferSelect;

// Resolver-local seam keeps error reporting replaceable in focused tests without widening
// the Fedify or application-wide error-reporting API.
export const remoteProfileSearchErrorReporter = {
  capture: captureUnexpectedError,
};

const escapeLikePattern = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

type RemoteProfileHandle = Extract<ReturnType<typeof parseProfileHandle>, { kind: 'remote' }>;

const isExplicitRemoteHandle = (
  query: string,
  parsed: ReturnType<typeof parseProfileHandle>,
): parsed is RemoteProfileHandle =>
  query.trim().startsWith('@') &&
  parsed?.kind === 'remote' &&
  profileHandleSchema.safeParse(parsed.handle).success &&
  parsed.handle === parsed.handle.trim();

const isExpectedRemoteMaterializationError = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof ConflictError ||
  error instanceof NotFoundError;

builder.queryField('profileByHandle', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    args: {
      handle: t.arg.string({ required: true }),
    },
    resolve: async (_, args) => {
      const localInstance = await resolveConfiguredLocalInstance();
      const parsed = parseProfileHandle(args.handle, {
        configuredLocalDomain: localInstance.domain,
      });

      if (!parsed) {
        return null;
      }

      if (parsed.kind === 'remote') {
        return db
          .select(getColumns(Profiles))
          .from(Profiles)
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Instances.domain, parsed.domain),
              eq(Instances.kind, InstanceKind.ACTIVITYPUB),
              eq(Profiles.normalizedHandle, parsed.normalizedHandle),
              visibleProfileWhere({ profile: Profiles, instance: Instances }),
            ),
          )
          .limit(1)
          .then(first);
      }

      return db
        .select(getColumns(Profiles))
        .from(Profiles)
        .where(
          and(
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Profiles.instanceId, localInstance.id),
            eq(Profiles.normalizedHandle, parsed.normalizedHandle),
          ),
        )
        .limit(1)
        .then(first);
    },
  }),
);

builder.queryField('searchProfiles', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: Profile,
      args: {
        query: t.arg.string({ required: true }),
      },
      resolve: async (_, args) => {
        const localInstance = await resolveConfiguredLocalInstance();
        const parsed = parseProfileHandle(args.query, {
          configuredLocalDomain: localInstance.domain,
        });

        if (!parsed) {
          return resolveCursorConnection<Promise<ProfileRow[]>>(
            { args, toCursor: (profile) => profile.id },
            () => Promise.resolve([]),
          );
        }

        let materializedProfileId: string | undefined;

        if (isExplicitRemoteHandle(args.query, parsed)) {
          try {
            const profile = await findOrMaterializeRemoteProfileActor({
              context: federation.createContext(new URL(localInstance.canonicalOrigin), undefined),
              handle: `${parsed.handle}@${parsed.domain}`,
              scheduleRefresh: () => undefined,
            });
            materializedProfileId = profile.id;
          } catch (error) {
            if (!isExpectedRemoteMaterializationError(error)) {
              remoteProfileSearchErrorReporter.capture(error);
            }

            return resolveCursorConnection<Promise<ProfileRow[]>>(
              { args, toCursor: (profile) => profile.id },
              () => Promise.resolve([]),
            );
          }
        }

        const handlePattern = `%${escapeLikePattern(parsed.normalizedHandle)}%`;
        const normalizedHandleLike = sql`
        ${Profiles.normalizedHandle} LIKE ${handlePattern} ESCAPE '\\'
      `;

        return resolveCursorConnection<Promise<ProfileRow[]>>(
          { args, toCursor: (profile) => profile.id },
          ({ after, before, inverted, limit }) => {
            const cursorWhere = and(
              after ? gt(Profiles.id, after) : undefined,
              before ? lt(Profiles.id, before) : undefined,
            );

            if (materializedProfileId) {
              return db
                .select(getColumns(Profiles))
                .from(Profiles)
                .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
                .where(
                  and(
                    eq(Profiles.id, materializedProfileId),
                    cursorWhere,
                    visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  ),
                )
                .orderBy(inverted ? desc(Profiles.id) : asc(Profiles.id))
                .limit(limit);
            }

            if (parsed.kind === 'remote') {
              return db
                .select(getColumns(Profiles))
                .from(Profiles)
                .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
                .where(
                  and(
                    eq(Instances.domain, parsed.domain),
                    eq(Instances.kind, InstanceKind.ACTIVITYPUB),
                    normalizedHandleLike,
                    cursorWhere,
                    visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  ),
                )
                .orderBy(inverted ? desc(Profiles.id) : asc(Profiles.id))
                .limit(limit);
            }

            return db
              .select(getColumns(Profiles))
              .from(Profiles)
              .where(
                and(
                  eq(Profiles.state, ProfileState.ACTIVE),
                  eq(Profiles.instanceId, localInstance.id),
                  normalizedHandleLike,
                  cursorWhere,
                ),
              )
              .orderBy(inverted ? desc(Profiles.id) : asc(Profiles.id))
              .limit(limit);
          },
        );
      },
    },
    ProfileConnection as never,
  ),
);
