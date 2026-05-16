import * as Enums from '@kosmo/core/enums';
import { builder } from './builder';

const createEnumRef = (name: keyof typeof Enums) => {
  builder.enumType(Enums[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('AccountProfileRole');
createEnumRef('FollowPolicy');
createEnumRef('FollowState');
createEnumRef('ProfileState');
