import { NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  interfaces: [Error],
});
