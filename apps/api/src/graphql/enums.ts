import * as E from '@kosmo/enum';
import { builder } from './builder';

const createEnumRef = (name: keyof typeof E) => {
  builder.enumType(E[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('InstanceType');
createEnumRef('ProfileFollowAcceptMode');
createEnumRef('ProfileState');
createEnumRef('ProfileRelationshipState');
