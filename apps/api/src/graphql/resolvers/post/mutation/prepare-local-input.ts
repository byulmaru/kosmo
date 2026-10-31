import { db, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation';
import { profileBlockVisibilityWhere } from '@kosmo/core/visibility';
import { and, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { resolveComposerProfileId } from '@/profile/authorization';
import { formatRelativeHandle } from '@/profile/identity';
import { visibleProfileWhere } from '@/profile/visibility';
import { Media } from '../../media/ref';
import { Profile } from '../../profile/ref';
import { extractPostMentionCandidates } from './mention-candidates';
import type { PostVisibility } from '@kosmo/core/enums';
import type { PostContentMentionReference } from '@kosmo/core/post-content/server';
import type { LocalPostInput } from '@kosmo/core/services';
import type { SessionContext } from '@/context';

export type LocalPostMutationInput = {
  actorProfileId?: { readonly id: string } | null;
  bodyText: string;
  contentWarning?: string | null;
  media?:
    | readonly {
        readonly altText?: string | null;
        readonly applyAiProhibitFilter?: boolean | null;
        readonly applyNightshade?: boolean | null;
        readonly mediaId: { readonly id: string };
      }[]
    | null;
  mentions?:
    | readonly {
        readonly end: number;
        readonly profileId: { readonly id: string };
        readonly start: number;
      }[]
    | null;
  repostSourceId?: { readonly id: string } | null;
  replyParentId?: { readonly id: string } | null;
  sensitiveMedia?: boolean | null;
  visibility: PostVisibility;
};

export const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    applyAiProhibitFilter: t.boolean({ required: false }),
    applyNightshade: t.boolean({
      required: false,
      defaultValue: false,
      deprecationReason: 'Use applyAiProhibitFilter instead.',
    }),
    mediaId: t.globalID({ for: Media }),
  }),
});

export const CreatePostMentionInput = builder.inputType('CreatePostMentionInput', {
  fields: (t) => ({
    end: t.int(),
    profileId: t.globalID({ for: Profile }),
    start: t.int(),
  }),
});

export const localPostMediaArraySchema = z.array(z.unknown()).max(4, {
  message: '이미지는 4개까지 첨부할 수 있어요.',
});

const localPostInputBaseSchema = z
  .object({
    bodyText: z.string(),
    contentWarning: z.string().nullish(),
    media: z.array(z.unknown()).nullish(),
    mentions: z.array(z.unknown()).nullish(),
  })
  .passthrough();

const withLocalPostContentValidation = <Schema extends z.ZodType>(schema: Schema) =>
  schema.superRefine((input, context) => {
    const value = input as z.infer<typeof localPostInputBaseSchema>;
    if (value.bodyText.length === 0 && (value.media?.length ?? 0) === 0) {
      context.addIssue({
        code: 'custom',
        message: '본문 또는 이미지를 추가해주세요.',
        path: ['bodyText'],
      });
    }

    if (
      [...normalizePostContentPlainText(value.bodyText)].length +
        [...normalizePostContentPlainText(value.contentWarning ?? '')].length >
      postBodyMaxLength
    ) {
      context.addIssue({
        code: 'custom',
        message:
          '본문과 내용 경고는 ' +
          postBodyMaxLength.toLocaleString('ko-KR') +
          '자까지 작성할 수 있어요.',
        path: ['contentWarning'],
      });
    }
  });

export const localPostCreateInputSchema = withLocalPostContentValidation(localPostInputBaseSchema);

export async function prepareLocalPostInput(
  input: LocalPostMutationInput,
  ctx: SessionContext,
): Promise<LocalPostInput & { readonly accountId: string }> {
  const media = input.media ?? [];
  const bodyText = normalizePostContentPlainText(input.bodyText);
  const contentWarning = normalizePostContentPlainText(input.contentWarning ?? '');
  const profileId = await resolveComposerProfileId(ctx, input.actorProfileId?.id);
  const mentions = input.mentions ?? [];
  let mentionReferences: PostContentMentionReference[] = [];

  if (mentions.length * 2 > input.bodyText.length) {
    throw new ValidationError('Mention selection exceeds body text', { field: 'mentions' });
  }

  const configuredLocalInstance =
    mentions.length > 0 || bodyText.includes('@')
      ? await resolveConfiguredLocalInstance()
      : undefined;
  const mentionCandidates = configuredLocalInstance
    ? extractPostMentionCandidates(bodyText, configuredLocalInstance.domain)
    : [];
  const selectedRanges = new Set(mentions.map(({ end, start }) => `${start}:${end}`));

  for (const candidate of mentionCandidates) {
    for (const mention of mentions) {
      if (
        candidate.start < mention.end &&
        mention.start < candidate.end &&
        (candidate.start !== mention.start || candidate.end !== mention.end)
      ) {
        throw new ValidationError('Mention selection overlaps a typed handle', {
          field: 'mentions',
        });
      }
    }
  }

  const automaticCandidates = mentionCandidates.filter(
    ({ end, start }) => !selectedRanges.has(`${start}:${end}`),
  );
  const mentionedProfileIds = new Set(mentions.map(({ profileId }) => profileId.id));
  const localCandidateHandles = [
    ...new Set(
      automaticCandidates.flatMap(({ handle }) =>
        handle.kind === 'local' ? [handle.normalizedHandle] : [],
      ),
    ),
  ];
  const remoteCandidatePairs = [
    ...new Map(
      automaticCandidates.flatMap(({ handle }) =>
        handle.kind === 'remote'
          ? [[`${handle.domain}\0${handle.normalizedHandle}`, handle] as const]
          : [],
      ),
    ).values(),
  ];
  const automaticTargetWhere = configuredLocalInstance
    ? or(
        localCandidateHandles.length > 0
          ? and(
              eq(Profiles.instanceId, configuredLocalInstance.id),
              inArray(Profiles.normalizedHandle, localCandidateHandles),
            )
          : undefined,
        remoteCandidatePairs.length > 0
          ? and(
              eq(Instances.kind, InstanceKind.ACTIVITYPUB),
              or(
                ...remoteCandidatePairs.map(({ domain, normalizedHandle }) =>
                  and(
                    eq(Instances.domain, domain),
                    eq(Profiles.normalizedHandle, normalizedHandle),
                  ),
                ),
              ),
            )
          : undefined,
      )
    : undefined;
  const targetWhere = or(
    mentionedProfileIds.size > 0 ? inArray(Profiles.id, [...mentionedProfileIds]) : undefined,
    automaticTargetWhere,
  );
  const targets = targetWhere
    ? await db
        .select({
          domain: Instances.domain,
          handle: Profiles.handle,
          id: Profiles.id,
          instanceId: Instances.id,
          kind: Instances.kind,
          normalizedHandle: Profiles.normalizedHandle,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            targetWhere,
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
            profileBlockVisibilityWhere({
              database: db,
              ownerProfileId: profileId,
              targetProfileId: Profiles.id,
            }),
            profileBlockVisibilityWhere({
              database: db,
              ownerProfileId: Profiles.id,
              targetProfileId: profileId,
            }),
          ),
        )
    : [];

  const selectedTargets = targets.filter(({ id }) => mentionedProfileIds.has(id));
  if (selectedTargets.length !== mentionedProfileIds.size) {
    throw new ValidationError('Mention target is unavailable', { field: 'mentions' });
  }

  const targetHandles = new Map(
    targets.map((target) => [
      target.id,
      formatRelativeHandle(
        { handle: target.handle, instanceId: target.instanceId },
        {
          configuredLocalInstance: configuredLocalInstance!,
          profileInstance: { domain: target.domain, id: target.instanceId },
        },
      ),
    ]),
  );

  if (mentions.length > 0) {
    mentionReferences = mentions.map(({ end, profileId, start }) => {
      const relativeHandle = targetHandles.get(profileId.id);
      if (!relativeHandle) {
        throw new ValidationError('Mention target is unavailable', { field: 'mentions' });
      }
      return {
        end,
        handle: relativeHandle,
        profileId: profileId.id,
        relativeHandle,
        start,
      };
    });
  }

  if (automaticCandidates.length > 0) {
    const candidateProfileIds = new Map<string, string>();
    for (const target of targets) {
      const key =
        target.instanceId === configuredLocalInstance?.id
          ? `local:${target.normalizedHandle}`
          : target.kind === InstanceKind.ACTIVITYPUB
            ? `remote:${target.domain}:${target.normalizedHandle}`
            : undefined;
      if (key) {
        candidateProfileIds.set(key, target.id);
      }
    }

    for (const candidate of automaticCandidates) {
      const key =
        candidate.handle.kind === 'local'
          ? `local:${candidate.handle.normalizedHandle}`
          : `remote:${candidate.handle.domain}:${candidate.handle.normalizedHandle}`;
      const candidateProfileId = candidateProfileIds.get(key);
      if (candidateProfileId) {
        mentionReferences.push({
          end: candidate.end,
          handle: targetHandles.get(candidateProfileId)!,
          profileId: candidateProfileId,
          relativeHandle: candidate.relativeHandle,
          start: candidate.start,
        });
      }
    }
  }

  return {
    accountId: ctx.session.accountId,
    bodyText,
    contentWarning: contentWarning || null,
    media: media.map(({ altText, mediaId }) => ({
      altText: altText ?? null,
      mediaId: mediaId.id,
    })),
    mentions: mentionReferences,
    origin: 'LOCAL',
    profileId,
    replyParentId: input.replyParentId?.id,
    repostSourceId: input.repostSourceId?.id,
    sensitiveMedia: input.sensitiveMedia ?? false,
    visibility: input.visibility,
  };
}
