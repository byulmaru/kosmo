import './field';

import { env } from '@/env';
import { builder } from '@/graphql/builder';
import { File } from '@/graphql/objects';
import { mapErrorToNull } from '@/utils/array';

builder.node(File, {
  id: { resolve: (file) => file.id },

  loadManyWithoutCache: async (ids, ctx) => {
    return await File.getDataloader(ctx)
      .loadMany(ids)
      .then((files) => mapErrorToNull(files));
  },

  fields: (t) => ({
    placeholder: t.exposeString('placeholder', { nullable: true }),

    url: t.string({
      resolve: async (file) => {
        return `${env.PUBLIC_IMAGE_DOMAIN}/${file.id}/original`;
      },
    }),

    thumbnailUrl: t.string({
      resolve: async (file) => {
        return `${env.PUBLIC_IMAGE_DOMAIN}/${file.id}/thumbnail`;
      },
    }),
  }),
});
