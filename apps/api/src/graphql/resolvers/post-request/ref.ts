import { PostVisibility } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Media } from '../media/ref';
import { Post } from '../post/ref';
import { Profile } from '../profile/ref';
import { loadPostRequestStateForAccount } from './state';
import type { PostRequestSnapshot, PostRequestState } from '@kosmo/core/temporal/post-request';
import type { UserContext } from '@/context';

type CreatePostMediaSource = NonNullable<PostRequestSnapshot['input']['media']>[number];
type CreatePostMentionSource = NonNullable<PostRequestSnapshot['input']['mentions']>[number];

export const CreatePostMedia = builder.objectRef<CreatePostMediaSource>('CreatePostMedia');

CreatePostMedia.implement({
  fields: (t) => ({
    altText: t.exposeString('altText', { nullable: true }),
    applyNightshade: t.exposeBoolean('applyNightshade'),
    mediaId: t.globalID({ resolve: ({ mediaId }) => encodeGlobalId('Media', mediaId) }),
    media: t.field({
      type: Media,
      nullable: true,
      grantScopes: ['readMedia'],
      resolve: ({ mediaId }) => mediaId,
    }),
  }),
});

export const CreatePostMention = builder.objectRef<CreatePostMentionSource>('CreatePostMention');

CreatePostMention.implement({
  fields: (t) => ({
    start: t.exposeInt('start'),
    end: t.exposeInt('end'),
    profileId: t.globalID({ resolve: ({ profileId }) => encodeGlobalId('Profile', profileId) }),
    profile: t.field({
      type: Profile,
      nullable: true,
      resolve: ({ profileId }) => profileId,
    }),
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
    bodyText: t.string({ resolve: (request) => request.snapshot.input.bodyText }),
    contentWarning: t.string({
      nullable: true,
      resolve: (request) => request.snapshot.input.contentWarning ?? null,
    }),
    visibility: t.field({
      type: PostVisibility,
      resolve: (request) => request.snapshot.input.visibility,
    }),
    replyParentId: t.globalID({
      nullable: true,
      resolve: (request) => {
        const id = request.snapshot.input.replyParentId;
        return id ? encodeGlobalId('Post', id) : null;
      },
    }),
    replyParent: t.field({
      type: Post,
      nullable: true,
      resolve: (request) => request.snapshot.input.replyParentId ?? null,
    }),
    repostSourceId: t.globalID({
      nullable: true,
      resolve: (request) => {
        const id = request.snapshot.input.repostSourceId;
        return id ? encodeGlobalId('Post', id) : null;
      },
    }),
    repostSource: t.field({
      type: Post,
      nullable: true,
      resolve: (request) => request.snapshot.input.repostSourceId ?? null,
    }),
    mentions: t.field({
      type: [CreatePostMention],
      resolve: (request) => request.snapshot.input.mentions ?? [],
    }),
    media: t.field({
      type: [CreatePostMedia],
      resolve: (request) => request.snapshot.input.media ?? [],
    }),
    sensitiveMedia: t.boolean({
      resolve: (request) => request.snapshot.input.sensitiveMedia ?? false,
    }),
  }),
});

export type PostRequestPageShape = {
  readonly nextPageToken: string | null;
  readonly requests: readonly PostRequestState[];
};

export const PostRequestPage = builder.objectRef<PostRequestPageShape>('PostRequestPage');

PostRequestPage.implement({
  fields: (t) => ({
    requests: t.field({ type: [PostRequest], resolve: (page) => page.requests }),
    nextPageToken: t.exposeString('nextPageToken', { nullable: true }),
  }),
});
