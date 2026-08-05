import { PostVisibility } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { profilePrivateAccessLoader } from '../loader/private';
import { Profile } from '../ref';

const ProfilePrivate = builder.simpleObject('ProfilePrivate', {
  fields: (field) => ({
    defaultPostVisibility: field.field({ type: PostVisibility }),
  }),
});

builder.objectField(Profile, 'private', (t) =>
  t.withAuth({ login: true }).field({
    type: ProfilePrivate,
    nullable: true,
    resolve: async (profile, _, ctx) => {
      const access = await profilePrivateAccessLoader(ctx).load(profile.id);
      return access
        ? { defaultPostVisibility: profile.defaultPostVisibility ?? PostVisibility.UNLISTED }
        : null;
    },
  }),
);
