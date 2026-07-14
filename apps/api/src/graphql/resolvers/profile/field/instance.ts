import { InstanceKind } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { profileInstanceByIdLoader } from '../loader/instance';
import { Profile } from '../ref';

const ProfileInstance = builder.simpleObject('ProfileInstance', {
  fields: (t) => ({
    kind: t.field({
      type: InstanceKind,
    }),
  }),
});

builder.objectField(Profile, 'instance', (t) =>
  t.field({
    type: ProfileInstance,
    resolve: async (profile, _, ctx) => {
      const profileInstance = await profileInstanceByIdLoader(ctx).load(profile.instanceId);

      if (!profileInstance) {
        throw new Error('Profile instance is required to resolve profile instance');
      }

      return profileInstance;
    },
  }),
);
