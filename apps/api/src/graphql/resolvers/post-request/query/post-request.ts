import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { PostRequest } from '../ref';
import { loadPostRequestStateForAccount } from '../state';

builder.queryField('postRequest', (t) =>
  t.withAuth({ login: true }).field({
    type: PostRequest,
    nullable: true,
    args: {
      profileId: t.arg.globalID({ for: Profile }),
      requestId: t.arg.string({ validate: z.uuid() }),
    },
    resolve: (_, args, ctx) =>
      loadPostRequestStateForAccount({
        accountId: ctx.session.accountId,
        profileId: args.profileId.id,
        requestId: args.requestId,
      }),
    unauthorizedResolver: () => null,
  }),
);
