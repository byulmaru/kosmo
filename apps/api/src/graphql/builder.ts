import SchemaBuilder from '@pothos/core';
import type { UserContext } from '@/context';

export const builder = new SchemaBuilder<{
  Context: UserContext;
}>({});

builder.queryType({});
