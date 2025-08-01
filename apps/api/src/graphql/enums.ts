import * as E from '@kosmo/shared/enums';
import { builder } from './builder';

const createEnumRef = (name: keyof typeof E) => {
  builder.enumType(E[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('ProfileState');
createEnumRef('ProfileRelationship');
