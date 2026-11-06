import { db, NaturalLanguageMuteRules } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { NaturalLanguageMuteRule } from '../natural-language-mute-rule-ref';
import { Profile } from '../ref';

builder.objectField(Profile, 'naturalLanguageMuteRules', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: [NaturalLanguageMuteRule],
    resolve: (profile, _, ctx) => {
      if (profile.id !== ctx.session.profile.id) {
        throw new PermissionDeniedError('Natural Language Mute Rule owner is required');
      }
      return db
        .select()
        .from(NaturalLanguageMuteRules)
        .where(eq(NaturalLanguageMuteRules.ownerProfileId, profile.id));
    },
  }),
);
