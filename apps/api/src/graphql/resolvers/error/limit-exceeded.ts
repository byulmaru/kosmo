import { LimitExceededError, TypedError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(LimitExceededError, {
  name: 'LimitExceededError',
  interfaces: [TypedError],
  fields: (t) => ({
    object: t.exposeString('object'),
    limit: t.exposeInt('limit'),
  }),
});
