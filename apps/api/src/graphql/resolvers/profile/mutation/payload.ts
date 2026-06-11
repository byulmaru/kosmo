import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';

export const CreateProfilePayload = builder.simpleObject('CreateProfilePayload', {
  fields: (t) => ({
    profile: t.field({ type: Profile }),
  }),
});

export const DeleteProfilePayload = builder.simpleObject('DeleteProfilePayload', {
  fields: (t) => ({
    profileId: t.id(),
  }),
});

export const FollowProfilePayload = builder.simpleObject('FollowProfilePayload', {
  fields: (t) => ({
    profileFollow: t.field({ type: ProfileFollow }),
  }),
});

export const SelectProfilePayload = builder.simpleObject('SelectProfilePayload', {
  fields: (t) => ({
    profile: t.field({ type: Profile }),
  }),
});

export const UnfollowProfilePayload = builder.simpleObject('UnfollowProfilePayload', {
  fields: (t) => ({
    profile: t.field({ type: Profile }),
    profileFollowId: t.id({ nullable: true }),
  }),
});

export const UpdateProfilePayload = builder.simpleObject('UpdateProfilePayload', {
  fields: (t) => ({
    profile: t.field({ type: Profile }),
  }),
});
