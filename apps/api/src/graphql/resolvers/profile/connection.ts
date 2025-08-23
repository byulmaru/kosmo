import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

export const ProfileConnection = builder.connectionObject({
  type: Profile,
  name: 'ProfileConnection',
});
