import { ValidationError } from '@kosmo/core/error';
import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
import WithInputPlugin from '@pothos/plugin-with-input';
import * as R from 'remeda';
import { globalIdMap } from './utils';
import type { TipTapDocument } from '@kosmo/core/tiptap';
import type { SessionContext, SessionWithProfileContext, UserContext } from '@/context';

export const builder = new SchemaBuilder<{
  AuthContexts: {
    login: UserContext & SessionContext;
    usingProfile: UserContext & SessionWithProfileContext;
  };
  AuthScopes: {
    login: boolean;
    usingProfile: boolean;
  };
  Context: UserContext;
  DefaultAuthStrategy: 'all';
  DefaultFieldNullability: false;
  DefaultInputFieldRequiredness: true;
  Scalars: {
    DateTime: {
      Input: Temporal.Instant;
      Output: Temporal.Instant;
    };
    TipTapDocument: {
      Input: TipTapDocument;
      Output: TipTapDocument;
    };
  };
}>({
  plugins: [
    RelayPlugin,
    ScopeAuthPlugin,
    ErrorsPlugin,
    ValidationPlugin,
    WithInputPlugin,
    DataloaderPlugin,
  ],
  defaultFieldNullability: false,
  defaultInputFieldRequiredness: true,
  errors: {
    defaultTypes: [],
    defaultResultOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Success`,
    },
    defaultUnionOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Result`,
    },
  },
  validation: {
    validationError: (failure) => {
      const issue = failure.issues[0];
      const field = issue?.path
        ?.map((segment) => (typeof segment === 'object' ? segment.key : segment))
        .filter((segment) => segment !== 'input')
        .join('.');

      return new ValidationError(issue?.message, { field: field || undefined });
    },
  },
  relay: {
    encodeGlobalID: (_, id) => String(id),
    decodeGlobalID: (id) => {
      const typename = globalIdMap.get(Number.parseInt(id.replaceAll('-', '').slice(13, 16), 16));

      if (!typename) {
        throw new Error(`Unknown global id type code`);
      }

      return { id, typename };
    },
  },
  scopeAuth: {
    authScopes: async (ctx) => ({
      login: !!ctx.session,
      usingProfile: !!ctx.session?.profileId,
    }),
    defaultStrategy: 'all',
    runScopesOnType: true,
  },
  withInput: {
    typeOptions: {
      name: ({ fieldName }) => `${R.capitalize(fieldName)}Input`,
    },
  },
});

builder.queryType({});
builder.mutationType({});

builder.scalarType('DateTime', {
  description: 'RFC9557 formatted string',
  serialize: (value) => value.toString({ smallestUnit: 'millisecond' }),
  parseValue: (value) => {
    if (typeof value === 'string') {
      return Temporal.Instant.from(value);
    }

    throw new Error('Invalid DateTime value');
  },
});

builder.scalarType('TipTapDocument', {
  description: 'TipTap JSON document',
  serialize: (value) => value,
  parseValue: (value) => value as TipTapDocument,
});
