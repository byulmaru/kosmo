import { MediaState, MediaUsePermission } from '@kosmo/core/enums';
import { mediaUseTermsUrl } from '@kosmo/core/media-metadata';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { mediaByIdLoader } from './loader/by-id';
import type { MediaRightsProjection } from '@kosmo/core/media-metadata';

const MediaRights = builder.simpleObject('MediaRights', {
  fields: (t) => ({
    commercial: t.field({ type: MediaUsePermission }),
    holderName: t.string(),
    holderUrl: t.string(),
    licenseUrl: t.string(),
    noncommercial: t.field({ type: MediaUsePermission }),
    personal: t.field({ type: MediaUsePermission }),
  }),
});

export const Media = createObjectRef('Media', async (ids, ctx) => {
  if (!ctx.session) {
    return [];
  }

  const media = await mediaByIdLoader(ctx).loadMany(ids);

  return media.map((item) =>
    item instanceof Error || item?.accountId !== ctx.session?.accountId ? null : item,
  );
});

Media.implement({
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
    rights: t.field({
      type: MediaRights,
      authScopes: { $granted: 'readMedia' },
      nullable: true,
      resolve: (media): MediaRightsProjection | null => {
        const metadata = media.publicationMetadata;
        if (!metadata?.rights) {
          return null;
        }
        return {
          ...metadata.rights,
          holderName: metadata.attributionName,
          holderUrl: metadata.attributionUrl,
          licenseUrl: mediaUseTermsUrl(metadata.rights, new URL(metadata.attributionUrl).origin),
        };
      },
    }),
    state: t.expose('state', { type: MediaState }),
    thumbhash: t.exposeString('thumbhash', {
      authScopes: { $granted: 'readMedia' },
      nullable: true,
    }),
    url: t.exposeString('url', {
      authScopes: { $granted: 'readMedia' },
      nullable: true,
    }),
  }),
});
