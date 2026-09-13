import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { mentionedProfilesLoader } from '../loader/mentioned-profiles';
import { PostContent } from '../ref';

builder.objectField(PostContent, 'mentionedProfiles', (t) =>
  t.field({
    type: [Profile],
    resolve: (content, _, ctx) => mentionedProfilesLoader(ctx).load(content.id),
  }),
);
