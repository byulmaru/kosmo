import { stringifyPath } from '@kosmo/validation';
import SchemaBuilder from '@pothos/core';
import DataLoaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import ValidationPlugin from '@pothos/plugin-validation';
import WithInputPlugin from '@pothos/plugin-with-input';
import dayjs from 'dayjs';
import { GraphQLJSON } from 'graphql-scalars';
import * as R from 'remeda';
import { base64 } from 'rfc4648';
import { match } from 'ts-pattern';
import { UnauthorizedError, ValidationError } from '@/errors';
import { hasScope } from '@/utils/scope';
import type { TableCode } from '@kosmo/db';
import type { Scope } from '@kosmo/type';
import type { SessionContext, UserContext } from '@/context';

export const builder = new SchemaBuilder<{
  AuthContexts: {
    session: UserContext & SessionContext;
    scope: UserContext & SessionContext;
    profile: UserContext & SessionContext & { session: { profileId: string } };
  };
  AuthScopes: {
    session: boolean;
    scope: Scope;
    profile: boolean;
  };
  DefaultAuthStrategy: 'all';
  Context: UserContext;
  DefaultInputFieldRequiredness: true;
  DefaultFieldNullability: false;
  Scalars: {
    Binary: { Input: Uint8Array; Output: Uint8Array };
    Timestamp: { Input: dayjs.Dayjs; Output: dayjs.Dayjs };
    ID: { Input: string; Output: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JSON: { Input: any; Output: unknown };
  };
}>({
  defaultInputFieldRequiredness: true,
  defaultFieldNullability: false,

  plugins: [
    RelayPlugin,
    ScopeAuthPlugin,
    ErrorsPlugin,
    DataLoaderPlugin,
    SimpleObjectsPlugin,
    WithInputPlugin,
    ValidationPlugin,
  ],

  scopeAuth: {
    authScopes: (context) => ({
      session: !!context.session,
      scope: (scope) => hasScope({ scope, sessionScopes: context.session?.scopes }),
      profile: !!context.session?.profileId,
    }),
    treatErrorsAsUnauthorized: true,
    authorizeOnSubscribe: true,
    unauthorizedError: () => new UnauthorizedError(),
  },

  withInput: {
    typeOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Input`,
    },
  },

  errors: {
    defaultResultOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Success`,
    },

    defaultUnionOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Result`,
    },
  },

  validation: {
    validationError: (error) =>
      new ValidationError({
        path: error.issues[0]?.path ? stringifyPath(error.issues[0].path) : undefined,
        code: error.issues[0].message,
      }),
  },

  relay: {
    encodeGlobalID: (_, id) => String(id),
    decodeGlobalID: (globalId) => {
      const [tableCode] = globalId.split('0', 2);

      return {
        typename: match(tableCode as (typeof TableCode)[keyof typeof TableCode])
          .with('ACNT', () => 'Account')
          .with('INST', () => 'Instance')
          .with('POST', () => 'Post')
          .with('PRFL', () => 'Profile')
          .run(),
        id: globalId,
      };
    },
  },
});

builder.queryType();
builder.mutationType();
// builder.subscriptionType();

builder.addScalarType('JSON', GraphQLJSON);

builder.scalarType('Binary', {
  serialize: (value) => base64.stringify(value),
  parseValue: (value) => {
    if (typeof value === 'string') {
      return base64.parse(value);
    }

    throw new Error('Invalid binary value');
  },

  description: 'Base64 encoded binary data',
});

builder.scalarType('Timestamp', {
  serialize: (value) => value.valueOf(),
  parseValue: (value) => {
    if (typeof value === 'number') {
      const d = dayjs(value);
      if (d.isValid()) {
        return d;
      }
    }

    throw new Error('Invalid datetime value');
  },
  description: 'Unix timestamp in milliseconds',
});

export type Builder = typeof builder;
