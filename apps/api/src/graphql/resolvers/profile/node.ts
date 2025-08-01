import { ProfileState } from '@kosmo/shared/enums';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.node(Profile, {
  id: { resolve: (profile) => profile.id },

  loadManyWithoutCache: async (ids, ctx) => {
    return (await Profile.getDataloader(ctx).loadMany(ids)).map((profile) =>
      profile instanceof Error ? null : profile,
    );
  },

  fields: (t) => ({
    handle: t.exposeString('handle'),
    description: t.exposeString('description', { nullable: true }),
    state: t.expose('state', { type: ProfileState }),
    displayName: t.string({
      args: {
        fallback: t.arg.boolean({ defaultValue: true }),
      },
      resolve: (profile, { fallback }) => profile.displayName || (fallback ? profile.handle : ''),
    }),

    url: t.string({
      resolve: (profile) => profile.url ?? profile.uri,
    }),
  }),
});
