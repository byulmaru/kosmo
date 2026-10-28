import { builder } from '@/graphql/builder';

export type AccountMetadata = Readonly<{
  key: string;
  value: string;
}>;

export const AccountMetadata = builder.simpleObject('AccountMetadata', {
  fields: (t) => ({
    key: t.string(),
    value: t.string(),
  }),
});
