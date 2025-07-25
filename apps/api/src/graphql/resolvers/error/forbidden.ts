import { ForbiddenError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(ForbiddenError, {
  name: 'ForbiddenError',
  interfaces: [Error],
});
