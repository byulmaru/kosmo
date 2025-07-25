import { ConflictError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(ConflictError, {
  name: 'ConflictError',
  interfaces: [Error],
});
