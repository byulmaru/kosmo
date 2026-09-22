import { db } from '@kosmo/core/db';
import { visibleQuoteSources } from '@kosmo/core/services';
import type { QuoteSource } from '@kosmo/core/services';
import type { UserContext } from '@/context';

export const repostSourceLoader = (ctx: UserContext) =>
  ctx.loader<QuoteSource, QuoteSource, QuoteSource, true>({
    name: 'post.repostSource',
    nullable: true,
    load: (quotes) =>
      visibleQuoteSources(db, { quotes, viewerProfileId: ctx.session?.profile?.id }),
    key: (row) => row,
  });
