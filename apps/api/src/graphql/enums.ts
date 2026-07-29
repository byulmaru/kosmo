import * as Enums from '@kosmo/core/enums';
import { builder } from './builder';

const createEnumRef = (name: keyof typeof Enums) => {
  builder.enumType(Enums[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('AccountProfileRole');
createEnumRef('MediaState');
createEnumRef('PostState');
createEnumRef('PostVisibility');
createEnumRef('ProfileFollowPolicy');
createEnumRef('InstanceKind');
createEnumRef('ProfileState');

export const FeedbackKind = builder.enumType('FeedbackKind', {
  values: ['POSITIVE', 'NEGATIVE', 'FEATURE_REQUEST', 'BUG_REPORT'] as const,
});
