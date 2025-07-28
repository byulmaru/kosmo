import './conflict';
import './forbidden';
import './limit-exceeded';
import './not-found';
import './validation';

import { FieldError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.interfaceType(Error, {
  name: 'Error',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

builder.interfaceType(FieldError, {
  name: 'FieldError',
  interfaces: [Error],
  fields: (t) => ({
    path: t.exposeString('path', { nullable: true }),
  }),
});
