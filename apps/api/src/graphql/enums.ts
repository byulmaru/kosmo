import * as Enums from '@kosmo/core/enums';
import { builder } from './builder';

type EnumName = Exclude<keyof typeof Enums, 'AccountProfileRoleOrder'>;

const createEnumRef = (name: EnumName) => {
  builder.enumType(Enums[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('AccountProfileRole');
createEnumRef('FeedbackKind');
createEnumRef('MediaState');
createEnumRef('PostState');
createEnumRef('PostVisibility');
createEnumRef('ProfileFollowPolicy');
createEnumRef('InstanceKind');
createEnumRef('ProfileState');
createEnumRef('PushInstallationPlatform');
