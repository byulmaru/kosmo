import { db, first, HashtagMuteRules, Hashtags, Instances, Profiles } from '@kosmo/core/db';
import {
  HashtagMuteDecision,
  HashtagMuteScope,
  InstanceKind,
  InstanceState,
  ProfileState,
} from '@kosmo/core/enums';
import {
  ConflictError,
  KosmoError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { and, eq, sql } from 'drizzle-orm';
import type { HashtagMuteCommand, HashtagMuteResult } from '@kosmo/core/temporal/hashtag-mute';

export type HashtagMuteExecution =
  | { readonly ok: true; readonly result: HashtagMuteResult }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string; readonly field?: string };
    };

const normalizeScopes = (scopes: HashtagMuteScope[]) => [...new Set(scopes)];

const snapshot = (rule: typeof HashtagMuteRules.$inferSelect): HashtagMuteResult => ({
  rule: {
    ...rule,
    expiresAt: rule.expiresAt?.toString() ?? null,
    createdAt: rule.createdAt.toString(),
    updatedAt: rule.updatedAt.toString(),
  },
});

export const executeHashtagMuteRuleActivity = async (
  input: HashtagMuteCommand,
): Promise<HashtagMuteExecution> => {
  try {
    return await db.transaction(async (tx) => {
      let result: HashtagMuteResult;
      if (input.action === 'DELETE') {
        const rule = await tx
          .delete(HashtagMuteRules)
          .where(
            and(
              eq(HashtagMuteRules.id, input.ruleId),
              eq(HashtagMuteRules.ownerProfileId, input.ownerProfileId),
            ),
          )
          .returning()
          .then(first);
        if (!rule) {
          const existing = await tx
            .select({ id: HashtagMuteRules.id, ownerProfileId: HashtagMuteRules.ownerProfileId })
            .from(HashtagMuteRules)
            .where(eq(HashtagMuteRules.id, input.ruleId))
            .then(first);
          if (existing) {
            throw new NotFoundError('Hashtag Mute Rule not found');
          }
          return { ok: true, result: { deletedRuleId: input.ruleId } } as const;
        }
        result = { deletedRuleId: rule.id };
      } else {
        if (input.action === 'CREATE') {
          const existingById = await tx
            .select()
            .from(HashtagMuteRules)
            .where(eq(HashtagMuteRules.id, input.commandId))
            .then(first);
          if (existingById) {
            if (
              existingById.ownerProfileId !== input.ownerProfileId ||
              existingById.targetHashtagId !== input.targetHashtagId
            ) {
              throw new ConflictError({ message: 'Hashtag Mute command identity was reused' });
            }
            return { ok: true, result: snapshot(existingById) } as const;
          }
        }
        if (
          input.scopes !== undefined &&
          (input.scopes.length === 0 ||
            input.scopes.some((scope) => !Object.values(HashtagMuteScope).includes(scope)))
        ) {
          throw new ValidationError('At least one valid Scope is required', { field: 'scopes' });
        }
        if (
          input.decision !== undefined &&
          !Object.values(HashtagMuteDecision).includes(input.decision)
        ) {
          throw new ValidationError('Invalid Mute Decision', { field: 'decision' });
        }
        if (
          input.action !== 'CREATE' &&
          input.expiresAt !== undefined &&
          input.expiresAt !== null &&
          Temporal.Instant.compare(
            Temporal.Instant.from(input.expiresAt),
            Temporal.Now.instant(),
          ) <= 0
        ) {
          throw new ValidationError('Expiration must be in the future or permanent', {
            field: 'expiresAt',
          });
        }
        let rule;
        if (input.action === 'CREATE') {
          const owner = await tx
            .select({ state: Profiles.state, kind: Instances.kind, instanceState: Instances.state })
            .from(Profiles)
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(eq(Profiles.id, input.ownerProfileId))
            .then(first);
          if (
            !owner ||
            owner.state !== ProfileState.ACTIVE ||
            owner.kind !== InstanceKind.LOCAL ||
            owner.instanceState !== InstanceState.ACTIVE
          ) {
            throw new PermissionDeniedError('Active Local Profile is required');
          }
          if (
            !(await tx
              .select({ id: Hashtags.id })
              .from(Hashtags)
              .where(eq(Hashtags.id, input.targetHashtagId))
              .then(first))
          ) {
            throw new NotFoundError('Hashtag not found');
          }
          const values = {
            ownerProfileId: input.ownerProfileId,
            targetHashtagId: input.targetHashtagId,
            scopes: normalizeScopes(input.scopes),
            decision: input.decision,
            expiresAt: input.expiresAt === null ? null : Temporal.Instant.from(input.expiresAt),
          };

          rule = await tx
            .insert(HashtagMuteRules)
            .select(
              tx
                .select({
                  id: sql<string>`${input.commandId}::uuid`.as('id'),
                  ownerProfileId: sql<string>`${values.ownerProfileId}::uuid`.as(
                    'owner_profile_id',
                  ),
                  targetHashtagId: sql<string>`${values.targetHashtagId}::uuid`.as(
                    'target_hashtag_id',
                  ),
                  scopes: sql<typeof values.scopes>`ARRAY[${sql.join(
                    values.scopes.map((scope) => sql`${scope}::hashtag_mute_scope`),
                    sql`, `,
                  )}]`.as('scopes'),
                  decision: sql<
                    typeof values.decision
                  >`${values.decision}::hashtag_mute_decision`.as('decision'),
                  expiresAt:
                    values.expiresAt === null
                      ? sql<Temporal.Instant | null>`NULL::timestamptz`.as('expires_at')
                      : sql<Temporal.Instant | null>`${values.expiresAt.toString()}::timestamptz`.as(
                          'expires_at',
                        ),
                  createdAt: sql<Temporal.Instant>`clock_timestamp()`.as('created_at'),
                  updatedAt: sql<Temporal.Instant>`clock_timestamp()`.as('updated_at'),
                })
                .from(sql`(VALUES (1)) AS input_guard(value)`)
                .where(
                  values.expiresAt === null
                    ? sql`true`
                    : sql`${values.expiresAt.toString()}::timestamptz > clock_timestamp()`,
                ),
            )
            .onConflictDoNothing()
            .returning()
            .then(first);
          if (!rule) {
            const sameId = await tx
              .select()
              .from(HashtagMuteRules)
              .where(eq(HashtagMuteRules.id, input.commandId))
              .then(first);
            if (sameId) {
              if (
                sameId.ownerProfileId !== values.ownerProfileId ||
                sameId.targetHashtagId !== values.targetHashtagId
              ) {
                throw new ConflictError({ message: 'Hashtag Mute command identity was reused' });
              }
              return { ok: true, result: snapshot(sameId) } as const;
            }

            rule = await tx
              .update(HashtagMuteRules)
              .set({
                id: input.commandId,
                scopes: values.scopes,
                decision: values.decision,
                expiresAt: values.expiresAt,
                createdAt: sql`clock_timestamp()`,
                updatedAt: sql`clock_timestamp()`,
              })
              .where(
                and(
                  eq(HashtagMuteRules.ownerProfileId, values.ownerProfileId),
                  eq(HashtagMuteRules.targetHashtagId, values.targetHashtagId),
                  sql`${HashtagMuteRules.id} <> ${input.commandId}::uuid`,
                  sql`${HashtagMuteRules.expiresAt} <= clock_timestamp()`,
                  values.expiresAt === null
                    ? undefined
                    : sql`${values.expiresAt.toString()}::timestamptz > clock_timestamp()`,
                ),
              )
              .returning()
              .then(first);
            if (!rule) {
              const sameIdAfterUpdate = await tx
                .select()
                .from(HashtagMuteRules)
                .where(eq(HashtagMuteRules.id, input.commandId))
                .then(first);
              if (sameIdAfterUpdate) {
                if (
                  sameIdAfterUpdate.ownerProfileId !== values.ownerProfileId ||
                  sameIdAfterUpdate.targetHashtagId !== values.targetHashtagId
                ) {
                  throw new ConflictError({ message: 'Hashtag Mute command identity was reused' });
                }
                return { ok: true, result: snapshot(sameIdAfterUpdate) } as const;
              }
              if (
                values.expiresAt !== null &&
                Temporal.Instant.compare(values.expiresAt, Temporal.Now.instant()) <= 0
              ) {
                throw new ValidationError('Expiration must be in the future or permanent', {
                  field: 'expiresAt',
                });
              }
              throw new ConflictError({ message: 'An active Hashtag Mute Rule already exists' });
            }
          }
        } else {
          const expiresAt =
            input.expiresAt === undefined
              ? undefined
              : input.expiresAt === null
                ? null
                : Temporal.Instant.from(input.expiresAt);
          const changes = [
            input.scopes === undefined
              ? undefined
              : sql`${HashtagMuteRules.scopes} IS DISTINCT FROM ARRAY[${sql.join(
                  normalizeScopes(input.scopes).map((scope) => sql`${scope}::hashtag_mute_scope`),
                  sql`, `,
                )}]::hashtag_mute_scope[]`,
            input.decision === undefined
              ? undefined
              : sql`${HashtagMuteRules.decision} IS DISTINCT FROM ${input.decision}::hashtag_mute_decision`,
            expiresAt === undefined
              ? undefined
              : expiresAt === null
                ? sql`${HashtagMuteRules.expiresAt} IS DISTINCT FROM NULL::timestamptz`
                : sql`${HashtagMuteRules.expiresAt} IS DISTINCT FROM ${expiresAt.toString()}::timestamptz`,
          ].filter(
            (condition): condition is NonNullable<typeof condition> => condition !== undefined,
          );
          rule = await tx
            .update(HashtagMuteRules)
            .set({
              ...(input.scopes === undefined ? {} : { scopes: normalizeScopes(input.scopes) }),
              ...(input.decision === undefined ? {} : { decision: input.decision }),
              ...(expiresAt === undefined ? {} : { expiresAt }),
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(HashtagMuteRules.id, input.ruleId),
                eq(HashtagMuteRules.ownerProfileId, input.ownerProfileId),
                changes.length ? sql`(${sql.join(changes, sql` OR `)})` : sql`false`,
                expiresAt === null
                  ? undefined
                  : expiresAt === undefined
                    ? sql`(${HashtagMuteRules.expiresAt} IS NULL OR ${HashtagMuteRules.expiresAt} > clock_timestamp())`
                    : sql`${expiresAt.toString()}::timestamptz > clock_timestamp()`,
              ),
            )
            .returning()
            .then(first);
          if (!rule) {
            const existing = await tx
              .select()
              .from(HashtagMuteRules)
              .where(
                and(
                  eq(HashtagMuteRules.id, input.ruleId),
                  eq(HashtagMuteRules.ownerProfileId, input.ownerProfileId),
                ),
              )
              .then(first);
            if (!existing) {
              throw new NotFoundError('Hashtag Mute Rule not found');
            }
            const finalExpiresAt = expiresAt === undefined ? existing.expiresAt : expiresAt;
            if (
              finalExpiresAt !== null &&
              Temporal.Instant.compare(finalExpiresAt, Temporal.Now.instant()) <= 0
            ) {
              throw new ValidationError('Expiration must be in the future or permanent', {
                field: 'expiresAt',
              });
            }
            rule = existing;
          }
        }
        result = snapshot(rule);
      }
      return { ok: true, result } as const;
    });
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...('field' in error && typeof error.field === 'string' ? { field: error.field } : {}),
      },
    };
  }
};
