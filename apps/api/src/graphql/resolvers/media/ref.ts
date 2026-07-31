import { MediaState } from '@kosmo/core/enums';
import { createObjectRef } from '@/graphql/utils';
import { mediaByIdLoader } from './loader/by-id';

export const MediaObject = createObjectRef('Media', async (ids, ctx) => {
  if (!ctx.session) {
    return [];
  }

  const media = await mediaByIdLoader(ctx).loadMany(ids);

  return media.map((item) =>
    item instanceof Error || item?.accountId !== ctx.session?.accountId ? null : item,
  );
});

MediaObject.implement({
  grantScopes: (media, ctx) => (media.accountId === ctx.session?.accountId ? ['readMedia'] : []),
  fields: (t) => ({
    altText: t.exposeString('altText', {
      authScopes: { $granted: 'readMedia' },
      nullable: true,
    }),
    mediaType: t.exposeString('mediaType', {
      authScopes: { $granted: 'readMedia' },
      nullable: true,
    }),
    readyAt: t.expose('readyAt', { type: 'DateTime', nullable: true }),
    state: t.expose('state', { type: MediaState }),
    url: t.exposeString('url', {
      authScopes: { $granted: 'readMedia' },
      nullable: true,
    }),
  }),
});
