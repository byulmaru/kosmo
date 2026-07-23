import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { viewerBookmarkLoader } from '../loader/viewer-bookmark';
import { Bookmark } from '../ref';

builder.objectField(Post, 'viewerBookmark', (t) =>
  t.withAuth({ usingProfile: true }).field({
    type: Bookmark,
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: (post, _, ctx) => viewerBookmarkLoader(ctx).load(post.id),
  }),
);
