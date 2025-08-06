import { ProfileState } from '@kosmo/shared/enums';
import { env } from '@/env';
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

    uri: t.string({
      resolve: (profile) => profile.uri ?? `${env.PUBLIC_WEB_DOMAIN}/profile/${profile.id}`,
    }),

    url: t.string({
      resolve: (profile) => profile.url ?? `${env.PUBLIC_WEB_DOMAIN}/@${profile.handle}`,
    }),
  }),
});
