import { db, Media } from '@kosmo/core/db';
import { MediaState } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const MediaObject = createObjectRef('Media', (ids, ctx) => {
  if (!ctx.session) {
    return Promise.resolve([]);
  }

  return db
    .select(getColumns(Media))
    .from(Media)
    .where(and(inArray(Media.id, ids), eq(Media.accountId, ctx.session.accountId)));
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
