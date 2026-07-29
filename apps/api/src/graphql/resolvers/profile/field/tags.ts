import { builder } from '@/graphql/builder';
import { Hashtag } from '../../hashtag';
import { profileTagsLoader } from '../loader/tags';
import { Profile } from '../ref';

builder.objectField(Profile, 'tags', (t) =>
  t.field({
    type: [Hashtag],
    resolve: (profile, _, ctx) => profileTagsLoader(ctx).load(profile.id),
  }),
);
