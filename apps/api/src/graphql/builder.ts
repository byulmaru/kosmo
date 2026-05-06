import { db, relations } from '@kosmo/core/db';
import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import DrizzlePlugin from '@pothos/plugin-drizzle';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

export const builder = new SchemaBuilder<{
  Context: UserContext;
  DrizzleRelations: typeof relations;
}>({
  plugins: [
    RelayPlugin,
    ScopeAuthPlugin,
    ErrorsPlugin,
    ValidationPlugin,
    DataloaderPlugin,
    DrizzlePlugin,
  ],
  drizzle: {
    client: db,
    getTableConfig,
    relations,
  },
  errors: {
    defaultTypes: [],
  },
  relay: {},
  scopeAuth: {
    authScopes: () => ({}),
  },
});

builder.queryType({});
