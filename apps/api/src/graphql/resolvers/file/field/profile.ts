import { AVATAR_FILE_ID } from '@kosmo/const';
import { builder } from '@/graphql/builder';
import { File, Profile } from '@/graphql/objects';

builder.objectFields(Profile, (t) => ({
  avatar: t.field({
    type: File,
    resolve: (profile) => profile.avatarFileId ?? AVATAR_FILE_ID,
  }),

  header: t.field({
    type: File,
    nullable: true,
    resolve: (profile) => profile.headerFileId,
  }),
}));
