import { builder } from '@/graphql/builder';
import { Session } from '../ref';

builder.queryField('currentSession', (t) =>
  t.withAuth({ login: true }).field({
    type: Session,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session.id,
    unauthorizedResolver: () => null,
  }),
);
