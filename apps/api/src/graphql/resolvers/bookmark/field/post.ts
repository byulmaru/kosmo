import { AccountProfileRole } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { viewerBookmarkLoader } from '../loader/viewer-bookmark';
import { Bookmark } from '../ref';

builder.objectField(Post, 'viewerBookmark', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: Bookmark,
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: (post, _, ctx) => viewerBookmarkLoader(ctx).load(post.id),
  }),
);
