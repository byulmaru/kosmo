import { db, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceKind, PostVisibility } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyMaxLength, postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { profileBlockVisibilityWhere } from '@kosmo/core/visibility';
import { and, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { resolveComposerProfileId } from '@/profile/authorization';
import { formatRelativeHandle } from '@/profile/identity';
import { visibleProfileWhere } from '@/profile/visibility';
import { Media } from '../../media/ref';
import { Profile } from '../../profile/ref';
import { Post } from '../ref';
import { extractPostMentionCandidates } from './mention-candidates';
import type { PostContentMentionReference } from '@kosmo/core/post-content/server';

const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    mediaId: t.globalID({ for: Media }),
  }),
});

const CreatePostMentionInput = builder.inputType('CreatePostMentionInput', {
  fields: (t) => ({
    end: t.int(),
    profileId: t.globalID({ for: Profile }),
    start: t.int(),
  }),
});

builder.mutationField('createPost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
    typeOptions: {
      validate: z
        .object({
          bodyText: z.string(),
          contentWarning: z.string().nullish(),
          media: z.array(z.unknown()).nullish(),
          mentions: z.array(z.unknown()).nullish(),
        })
        .passthrough()
        .refine(({ bodyText, media }) => bodyText.length > 0 || (media?.length ?? 0) > 0, {
          message: '본문 또는 이미지를 추가해주세요.',
          path: ['bodyText'],
        })
        .refine(
          ({ bodyText, contentWarning }) =>
            normalizePostContentPlainText(bodyText).length +
              normalizePostContentPlainText(contentWarning ?? '').length <=
            postBodyMaxLength,
          {
            message:
              '본문과 내용 경고는 ' +
              postBodyMaxLength.toLocaleString('ko-KR') +
              '자까지 작성할 수 있어요.',
            path: ['contentWarning'],
          },
        ),
    },
    input: {
      bodyText: t.input.string({ validate: postBodyTextOrEmptySchema }),
      contentWarning: t.input.string({ required: false }),
      media: t.input.field({
        type: [CreatePostMediaInput],
        required: false,
        validate: z.array(z.unknown()).max(4, { message: '이미지는 4개까지 첨부할 수 있어요.' }),
      }),
      mentions: t.input.field({
        type: [CreatePostMentionInput],
        required: false,
      }),
      actorProfileId: t.input.globalID({ for: Profile, required: false }),
      replyParentId: t.input.globalID({ for: Post, required: false }),
      repostSourceId: t.input.globalID({ for: Post, required: false }),
      sensitiveMedia: t.input.boolean({ required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
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

      if (mentions.length > 0) {
        const targetHandles = new Map(
          selectedTargets.map((target) => [
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
        mentionReferences = mentions.map(({ end, profileId, start }) => {
          const relativeHandle = targetHandles.get(profileId.id);
          if (!relativeHandle) {
            throw new ValidationError('Mention target is unavailable', { field: 'mentions' });
          }
          return { end, profileId: profileId.id, relativeHandle, start };
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
              profileId: candidateProfileId,
              relativeHandle: candidate.relativeHandle,
              start: candidate.start,
            });
          }
        }
      }

      const result = await createPost({
        accountId: ctx.session.accountId,
        ...(mentionReferences.length > 0 ? { authoredBodyText: input.bodyText } : {}),
        document: postContentDocumentFromTextAndMedia(
          input.bodyText,
          media.map(({ mediaId }) => ({
            mediaId: mediaId.id,
          })),
          input.sensitiveMedia ?? false,
          contentWarning || null,
          mentionReferences,
        ),
        media: media.map(({ altText, mediaId }) => ({
          altText: altText ?? null,
          mediaId: mediaId.id,
        })),
        origin: 'LOCAL',
        profileId,
        replyParentId: input.replyParentId?.id,
        repostSourceId: input.repostSourceId?.id,
        visibility: input.visibility,
      });

      return { post: result.post };
    },
  }),
);
