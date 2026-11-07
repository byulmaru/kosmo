import {
  db,
  first,
  firstOrThrow,
  Instances,
  NaturalLanguageMuteRules,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import {
  ConflictError,
  KosmoError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import {
  isNaturalLanguageMuteConditionWithinLimit,
  naturalLanguageMuteConditionMaxLength,
} from '@kosmo/core/temporal/natural-language-mute';
import { and, eq, sql } from 'drizzle-orm';
import type {
  NaturalLanguageMuteCommand,
  NaturalLanguageMuteResult,
  NaturalLanguageMuteRuleSnapshot,
} from '@kosmo/core/temporal/natural-language-mute';

export type NaturalLanguageMuteExecution =
  | { readonly ok: true; readonly result: NaturalLanguageMuteResult }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

const snapshot = (
  rule: typeof NaturalLanguageMuteRules.$inferSelect,
): NaturalLanguageMuteRuleSnapshot => ({
  id: rule.id,
  ownerProfileId: rule.ownerProfileId,
  condition: rule.condition,
});

export const executeNaturalLanguageMuteRuleActivity = async (
  input: NaturalLanguageMuteCommand,
): Promise<NaturalLanguageMuteExecution> => {
  try {
    if (input.action !== 'DELETE' && !isNaturalLanguageMuteConditionWithinLimit(input.condition)) {
      throw new ValidationError(
        `Condition must be at most ${naturalLanguageMuteConditionMaxLength} Unicode code points`,
        { field: 'condition' },
      );
    }

    const result = await db.transaction(
      async (tx): Promise<NaturalLanguageMuteResult> => {
        if (input.action === 'CREATE') {
          const existing = await tx
            .select()
            .from(NaturalLanguageMuteRules)
            .where(eq(NaturalLanguageMuteRules.ownerProfileId, input.ownerProfileId))
            .then(first);
          if (existing) {
            if (existing.condition === input.condition) {
              return { rule: snapshot(existing) };
            }
            throw new ConflictError({ message: 'A Natural Language Mute Rule already exists' });
          }

          const owner = await tx
            .select({
              state: Profiles.state,
              kind: Instances.kind,
              instanceState: Instances.state,
            })
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

          const rule = await tx
            .insert(NaturalLanguageMuteRules)
            .values({ ownerProfileId: input.ownerProfileId, condition: input.condition })
            .returning()
            .then(firstOrThrow);
          return { rule: snapshot(rule) };
        }

        if (input.action === 'UPDATE') {
          const rule = await tx
            .update(NaturalLanguageMuteRules)
            .set({
              condition: input.condition,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(NaturalLanguageMuteRules.id, input.ruleId),
                eq(NaturalLanguageMuteRules.ownerProfileId, input.ownerProfileId),
                sql`${NaturalLanguageMuteRules.condition} IS DISTINCT FROM ${input.condition}`,
              ),
            )
            .returning()
            .then(first);
          if (rule) {
            return { rule: snapshot(rule) };
          }

          const existing = await tx
            .select()
            .from(NaturalLanguageMuteRules)
            .where(
              and(
                eq(NaturalLanguageMuteRules.id, input.ruleId),
                eq(NaturalLanguageMuteRules.ownerProfileId, input.ownerProfileId),
              ),
            )
            .then(first);
          if (!existing) {
            throw new NotFoundError('Natural Language Mute Rule not found');
          }
          return { rule: snapshot(existing) };
        }

        const deleted = await tx
          .delete(NaturalLanguageMuteRules)
          .where(
            and(
              eq(NaturalLanguageMuteRules.id, input.ruleId),
              eq(NaturalLanguageMuteRules.ownerProfileId, input.ownerProfileId),
            ),
          )
          .returning({ id: NaturalLanguageMuteRules.id })
          .then(first);
        if (deleted) {
          return { deletedRuleId: deleted.id };
        }

        const existing = await tx
          .select({ id: NaturalLanguageMuteRules.id })
          .from(NaturalLanguageMuteRules)
          .where(eq(NaturalLanguageMuteRules.id, input.ruleId))
          .then(first);
        if (existing) {
          throw new NotFoundError('Natural Language Mute Rule not found');
        }
        return { deletedRuleId: input.ruleId };
      },
      input.action === 'CREATE' ? { isolationLevel: 'serializable' } : undefined,
    );
    return { ok: true, result };
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
};
