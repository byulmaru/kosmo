import './field';

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
    alt: t.exposeString('alt', { nullable: true }),

    url: t.string({
      resolve: (file) => file.path,
    }),

    thumbnailUrl: t.string({
      resolve: (file) => file.path,
    }),

    metadata: t.expose('metadata', {
      type: builder.simpleObject('FileMetadata', {
        fields: (t) => ({
          width: t.int(),
          height: t.int(),
        }),
      }),
      nullable: true,
    }),
  }),
});
