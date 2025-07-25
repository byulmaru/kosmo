import { LimitExceededError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(LimitExceededError, {
  name: 'LimitExceededError',
  interfaces: [Error],
  fields: (t) => ({
    object: t.exposeString('object'),
    limit: t.exposeInt('limit'),
  }),
});
