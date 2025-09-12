import { ForbiddenError, TypedError } from '@/error';
import { builder } from '@/graphql/builder';

builder.objectType(ForbiddenError, {
  name: 'ForbiddenError',
  interfaces: [TypedError],
});
