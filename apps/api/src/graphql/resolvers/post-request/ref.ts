import { PostVisibility } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Media } from '../media/ref';
import { Post } from '../post/ref';
import { Profile } from '../profile/ref';
import { loadPostRequestStateForAccount } from './state';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { UserContext } from '@/context';

type PostRequestDraftMentionSource = {
  end: number;
  profileId: string;
  profileNodeId: string;
  start: number;
};

type PostRequestDraftMediaSource = {
  altText: string | null;
  applyNightshade: boolean;
  mediaId: string;
  mediaNodeId: string;
};

type PostRequestDraftSource = {
  bodyText: string;
  contentWarning: string | null;
  media: readonly PostRequestDraftMediaSource[];
  mentions: readonly PostRequestDraftMentionSource[];
  replyParentId: string | null;
  replyParentNodeId: string | null;
  repostSourceId: string | null;
  repostSourceNodeId: string | null;
  sensitiveMedia: boolean;
  visibility: PostVisibility;
};

export const PostRequestDraftMention = builder.simpleObject('PostRequestDraftMention', {
  fields: (t) => ({
    start: t.exposeInt('start'),
    end: t.exposeInt('end'),
    profileId: t.exposeID('profileId'),
    profile: t.field({
      type: Profile,
      nullable: true,
      resolve: (mention) => mention.profileNodeId,
    }),
  }),
});

export const PostRequestDraftMedia = builder.simpleObject('PostRequestDraftMedia', {
  fields: (t) => ({
    mediaId: t.exposeID('mediaId'),
    altText: t.exposeString('altText', { nullable: true }),
    applyNightshade: t.exposeBoolean('applyNightshade'),
    media: t.field({
      type: Media,
      nullable: true,
      grantScopes: ['readMedia'],
      resolve: (draftMedia) => draftMedia.mediaNodeId,
    }),
  }),
});

export const PostRequestDraft = builder.simpleObject('PostRequestDraft', {
  fields: (t) => ({
    bodyText: t.exposeString('bodyText'),
    contentWarning: t.exposeString('contentWarning', { nullable: true }),
    visibility: t.expose('visibility', { type: PostVisibility }),
    replyParentId: t.exposeID('replyParentId', { nullable: true }),
    replyParent: t.field({
      type: Post,
      nullable: true,
      resolve: (draft) => draft.replyParentNodeId,
    }),
    repostSourceId: t.exposeID('repostSourceId', { nullable: true }),
    repostSource: t.field({
      type: Post,
      nullable: true,
      resolve: (draft) => draft.repostSourceNodeId,
    }),
    mentions: t.field({ type: [PostRequestDraftMention], resolve: (draft) => draft.mentions }),
    media: t.field({ type: [PostRequestDraftMedia], resolve: (draft) => draft.media }),
    sensitiveMedia: t.exposeBoolean('sensitiveMedia'),
  }),
});

// shortcut: Pothos batch loader types omit null; remove when nullable results are supported.
const loadPostRequestStates = (async (ids: string[], ctx: UserContext) => {
  const accountId = ctx.session?.accountId;
  if (!accountId) {
    return ids.map(() => null);
  }

  return Promise.all(
    ids.map((requestId) => loadPostRequestStateForAccount({ accountId, requestId })),
  );
}) as (ids: string[], ctx: UserContext) => Promise<PostRequestState[]>;

export const PostRequest = builder.loadableNodeRef('PostRequest', {
  load: loadPostRequestStates,
  toKey: (request) => request.snapshot.requestId,
  cacheResolved: true,
  id: { resolve: (request) => request.snapshot.requestId },
});

PostRequest.implement({
  fields: (t) => ({
    requestId: t.string({ resolve: (request) => request.snapshot.requestId }),
    authorProfile: t.field({
      type: Profile,
      nullable: true,
      resolve: (request) => request.snapshot.input.profileId,
    }),
    submittedAt: t.field({
      type: 'DateTime',
      resolve: (request) => Temporal.Instant.from(request.snapshot.submittedAt),
    }),
    status: t.field({ type: PostRequestStatus, resolve: (request) => request.status }),
    errorCode: t.string({ nullable: true, resolve: (request) => request.error?.code ?? null }),
    errorMessage: t.string({
      nullable: true,
      resolve: (request) => request.error?.message ?? null,
    }),
    post: t.field({
      type: Post,
      nullable: true,
      resolve: (request) => request.result?.postId ?? null,
    }),
    draft: t.field({
      type: PostRequestDraft,
      resolve: (request): PostRequestDraftSource => {
        const { input, mediaProcessing } = request.snapshot;
        const mediaProcessingById = new Map(
          mediaProcessing.map(({ applyNightshade, mediaId }) => [mediaId, applyNightshade]),
        );

        return {
          bodyText: input.bodyText,
          contentWarning: input.contentWarning ?? null,
          visibility: input.visibility,
          replyParentId: input.replyParentId ? encodeGlobalId('Post', input.replyParentId) : null,
          replyParentNodeId: input.replyParentId ?? null,
          repostSourceId: input.repostSourceId
            ? encodeGlobalId('Post', input.repostSourceId)
            : null,
          repostSourceNodeId: input.repostSourceId ?? null,
          mentions: (input.mentions ?? []).map(({ end, profileId, start }) => ({
            end,
            profileId: encodeGlobalId('Profile', profileId),
            profileNodeId: profileId,
            start,
          })),
          media: (input.media ?? []).map(({ altText, mediaId }) => ({
            altText,
            applyNightshade: mediaProcessingById.get(mediaId) ?? false,
            mediaId: encodeGlobalId('Media', mediaId),
            mediaNodeId: mediaId,
          })),
          sensitiveMedia: input.sensitiveMedia ?? false,
        };
      },
    }),
  }),
});

export const PostRequestConnection = builder.connectionObject(
  {
    type: PostRequest,
    name: 'PostRequestConnection',
  },
  {
    name: 'PostRequestConnectionEdge',
  },
);
