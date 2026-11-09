import { AccountProfileRole } from '@kosmo/core/enums';
import { homeTimelinePubSub } from '@kosmo/core/home-timeline/events';
import { initContextCache } from '@pothos/core';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.subscriptionField('homeTimelinePostAdded', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: Post,
    nullable: true,
    subscribe: (_parent, _args, ctx) =>
      homeTimelinePubSub.subscribe('homeTimelinePostAdded', ctx.session.profile.id),
    resolve: ({ postId }, _args, ctx) => {
      // Subscription contexts persist across events, so related Pothos-loaded rows may be stale.
      Object.assign(ctx, initContextCache());
      return postId;
    },
  }),
);
