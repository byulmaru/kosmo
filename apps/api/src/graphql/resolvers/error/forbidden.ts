import { ForbiddenError, TypedError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(ForbiddenError, {
  name: 'ForbiddenError',
  interfaces: [TypedError],
});
