import { builder } from '@/graphql/builder';
import { profileTagsLoader } from '../loader/tags';
import { Profile } from '../ref';

builder.objectField(Profile, 'tags', (t) =>
  t.field({
    type: ['String'],
    resolve: async (profile, _, ctx) =>
      (await profileTagsLoader(ctx).load(profile.id)).map(({ name }) => name),
  }),
);
