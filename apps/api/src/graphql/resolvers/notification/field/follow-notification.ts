import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { FollowNotification } from '../ref';

builder.objectField(FollowNotification, 'relatedProfile', (t) =>
  t.field({
    type: Profile,
    resolve: (notification) => notification.relatedProfileId,
  }),
);
