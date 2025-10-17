import { PostVisibility } from '@kosmo/enum';
import { PostService } from '@kosmo/service';
import { ForbiddenError, ValidationError } from '@/error';
import { builder } from '@/graphql/builder';
import { Post, Profile } from '@/graphql/objects';
import { parseProfileConfig } from '@/utils/profile';

builder.mutationField('createPost', (t) =>
  t.withAuth({ scope: 'post:write', profile: true }).fieldWithInput({
    type: Post,
    input: {
      content: t.input.field({ type: 'JSON' }),
      visibility: t.input.field({ type: PostVisibility, required: false }),
      replyToPostId: t.input.string({ required: false }),
    },

    errors: {
      types: [ValidationError, ForbiddenError],
      dataField: { name: 'post' },
    },

    resolve: async (_, { input }, ctx) => {
      const visibility: PostVisibility =
        input.visibility ??
        (await Profile.getDataloader(ctx)
          .load(ctx.session.profileId)
          .then((profile) => parseProfileConfig(profile.config).defaultPostVisibility));

      const post = await PostService.create.call({
        profileId: ctx.session.profileId,
        tiptapContent: input.content,
        visibility,
        replyToPostId: input.replyToPostId ?? undefined,
        isLocal: true,
      });

      return post;
    },
  }),
);
