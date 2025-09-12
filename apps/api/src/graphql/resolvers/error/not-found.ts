import { NotFoundError, TypedError } from '@/error';
import { builder } from '@/graphql/builder';

builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  interfaces: [TypedError],
});
