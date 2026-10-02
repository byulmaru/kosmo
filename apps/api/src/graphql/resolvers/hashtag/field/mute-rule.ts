import { db, HashtagMuteRules } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../../profile/ref';
import { viewerHashtagMuteRuleLoader } from '../loader/mute-rule';
import { HashtagMuteRule } from '../mute-rule-ref';
import { Hashtag } from '../ref';
import type { InferSelectModel } from 'drizzle-orm';

builder.objectFields(HashtagMuteRule, (t) => ({
  ownerProfile: t.field({ type: Profile, resolve: (rule) => rule.ownerProfileId }),
  targetHashtag: t.field({ type: Hashtag, resolve: (rule) => rule.targetHashtagId }),
}));

builder.objectField(Hashtag, 'viewerMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: HashtagMuteRule,
    nullable: true,
    resolve: (hashtag, _, ctx) => viewerHashtagMuteRuleLoader(ctx).load(hashtag.id),
    unauthorizedResolver: () => null,
  }),
);

builder.objectField(Profile, 'hashtagMuteRules', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).connection({
    type: HashtagMuteRule,
    resolve: (profile, args, ctx) => {
      if (profile.id !== ctx.session.profile.id) {
        throw new PermissionDeniedError('Hashtag Mute Rule owner is required');
      }
      return resolveCursorConnection<Promise<InferSelectModel<typeof HashtagMuteRules>[]>>(
        { args, toCursor: (rule) => rule.id },
        ({ before, after, limit, inverted }) =>
          db
            .select()
            .from(HashtagMuteRules)
            .where(
              and(
                eq(HashtagMuteRules.ownerProfileId, profile.id),
                before ? gt(HashtagMuteRules.id, before) : undefined,
                after ? lt(HashtagMuteRules.id, after) : undefined,
              ),
            )
            .orderBy(inverted ? asc(HashtagMuteRules.id) : desc(HashtagMuteRules.id))
            .limit(limit),
      );
    },
  }),
);
