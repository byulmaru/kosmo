import * as Enums from '@kosmo/core/enums';
import { builder } from './builder';

const createEnumRef = (name: keyof typeof Enums) => {
  builder.enumType(Enums[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('AccountProfileRole');
createEnumRef('ProfileFollowPolicy');
createEnumRef('ProfileFollowState');
createEnumRef('ProfileState');
