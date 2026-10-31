import { PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { builder } from '@/graphql/builder';
import { Media } from '../media/ref';
import { Post } from '../post/ref';
import { Profile } from '../profile/ref';
import { loadPostRequestStateForAccount } from './state';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { UserContext } from '@/context';

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
    status: t.field({ type: PostRequestStatus, resolve: (request) => request.status }),
    authorProfile: t.field({
      type: Profile,
      nullable: true,
      resolve: (request) => request.snapshot.input.profileId,
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
    media: t.field({
      type: [Media],
      nullable: { list: false, items: true },
      grantScopes: ['readMedia'],
      resolve: (request) => request.snapshot.input.media?.map(({ mediaId }) => mediaId) ?? [],
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
