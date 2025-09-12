import { ConflictError, TypedError } from '@/error';
import { builder } from '@/graphql/builder';

builder.objectType(ConflictError, {
  name: 'ConflictError',
  interfaces: [TypedError],
});
