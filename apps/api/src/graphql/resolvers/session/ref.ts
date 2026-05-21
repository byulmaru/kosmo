import { Sessions, TableDiscriminator } from '@kosmo/core/db';
import { createObjectRef } from '@/graphql/utils';

export const Session = createObjectRef('Session', Sessions, TableDiscriminator.Sessions);

Session.implement({
  authScopes: (session, ctx) => session.id === ctx.session?.id,
  fields: () => ({}),
});
