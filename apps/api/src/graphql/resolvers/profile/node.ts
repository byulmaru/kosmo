import { db, Profiles } from '@kosmo/db';
import { PostVisibility, ProfileFollowAcceptMode, ProfileState } from '@kosmo/enum';
import { and, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Instance, Profile } from '@/graphql/objects';
import { parseProfileConfig } from '@/utils/profile';

builder.node(Profile, {
  id: { resolve: (profile) => profile.id },

  loadMany: async (ids) => {
    return await db
      .select()
      .from(Profiles)
      .where(and(inArray(Profiles.id, ids), eq(Profiles.state, ProfileState.ACTIVE)));
  },

  fields: (t) => ({
    handle: t.exposeString('handle'),
    description: t.exposeString('description', { nullable: true }),
    state: t.expose('state', { type: ProfileState }),
    followAcceptMode: t.expose('followAcceptMode', { type: ProfileFollowAcceptMode }),
    displayName: t.string({
      args: {
        fallback: t.arg.boolean({ defaultValue: true }),
      },
      resolve: (profile, { fallback }) => profile.displayName || (fallback ? profile.handle : ''),
    }),

    uri: t.string({
      resolve: async (profile, _, ctx) => {
        const instance = await Instance.getDataloader(ctx).load(profile.instanceId);
        return profile?.uri ?? `${instance.webDomain}/profile/${profile.id}`;
      },
    }),

    url: t.string({
      resolve: async (profile, _, ctx) => {
        const instance = await Instance.getDataloader(ctx).load(profile.instanceId);
        return profile?.url ?? `${instance.webDomain}/@${profile.handle}`;
      },
    }),

    isMe: t.boolean({
      resolve: (profile, _, ctx) => ctx.session?.profileId === profile.id,
    }),

    config: t.field({
      type: builder.simpleObject('ProfileConfig', {
        fields: (t) => ({
          defaultPostVisibility: t.field({ type: PostVisibility }),
        }),
      }),
      nullable: true,

      resolve: (profile, _, ctx) => {
        if (profile.id !== ctx.session?.profileId) {
          return null;
        }

        return parseProfileConfig(profile.config);
      },
    }),
  }),
});
