import { NotFoundError, TypedError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  interfaces: [TypedError],
});
