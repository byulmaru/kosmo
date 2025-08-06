import { builder } from '@/graphql/builder';
import { Instance, Profile } from '@/graphql/objects';

builder.objectField(Profile, 'instance', (t) =>
  t.field({
    type: Instance,
    resolve: (profile) => profile.instanceId,
  }),
);

builder.objectField(Profile, 'fullHandle', (t) =>
  t.string({
    resolve: async (profile, _, ctx) => {
      const instance = await Instance.getDataloader(ctx).load(profile.instanceId);

      return `${profile.handle}@${instance.domain}`;
    },
  }),
);
