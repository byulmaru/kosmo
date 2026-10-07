import { builder } from '@/graphql/builder';
import { Session } from '../ref';

builder.queryField('currentSession', (t) =>
  t.withAuth({ operationalSession: true }).field({
    type: Session,
    nullable: true,
    resolve: (_, __, ctx) => ctx.operationalSession.id,
    unauthorizedResolver: () => null,
  }),
);
