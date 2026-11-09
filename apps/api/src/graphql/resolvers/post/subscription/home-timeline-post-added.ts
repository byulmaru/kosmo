import { AccountProfileRole } from '@kosmo/core/enums';
import { homeTimelinePubSub } from '@kosmo/core/home-timeline/events';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.subscriptionField('homeTimelinePostAdded', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: Post,
    nullable: true,
    subscribe: (_parent, _args, ctx) =>
      homeTimelinePubSub.subscribe('homeTimelinePostAdded', ctx.session.profile.id),
    resolve: ({ postId }, _args, ctx) => {
      // Subscription events reuse the context, so a previous Post row may be stale.
      Post.getDataloader(ctx).clearAll();
      return postId;
    },
  }),
);
