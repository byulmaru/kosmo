import { AccountProfileRole } from '@kosmo/core/enums';
import { homeTimelinePubSub } from '@kosmo/core/home-timeline/events';
import { initContextCache } from '@pothos/core';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

const TimelinePostAdded = builder.objectRef<{ postId: string }>('TimelinePostAdded').implement({
  fields: (t) => ({
    post: t.field({
      type: Post,
      nullable: true,
      resolve: ({ postId }) => postId,
    }),
  }),
});

const TimelineEvent = builder.unionType('TimelineEvent', {
  types: [TimelinePostAdded],
  resolveType: () => 'TimelinePostAdded',
});

builder.subscriptionField('timeline', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: TimelineEvent,
    nullable: true,
    subscribe: (_parent, _args, ctx) =>
      homeTimelinePubSub.subscribe('homeTimelinePostAdded', ctx.session.profile.id),
    resolve: (event, _args, ctx) => {
      // Subscription contexts persist across events, so related Pothos-loaded rows may be stale.
      Object.assign(ctx, initContextCache());
      return event;
    },
  }),
);
