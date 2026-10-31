import * as Enums from '@kosmo/core/enums';
import { PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { builder } from './builder';

type EnumName = Exclude<keyof typeof Enums, 'AccountProfileRoleOrder'>;

const createEnumRef = (name: EnumName) => {
  builder.enumType(Enums[name], {
    name,
  });
};

createEnumRef('AccountState');
createEnumRef('AccountProfileRole');
createEnumRef('ContentReportDeliveryStatus');
createEnumRef('ContentReportReason');
createEnumRef('ContentReportTargetType');
createEnumRef('HashtagMuteDecision');
createEnumRef('HashtagMuteScope');
createEnumRef('MediaState');
createEnumRef('PostState');
createEnumRef('PostVisibility');
createEnumRef('ProfileFollowPolicy');
createEnumRef('InstanceKind');
createEnumRef('ProfileState');
createEnumRef('PushInstallationPlatform');
builder.enumType(PostRequestStatus, { name: 'PostRequestStatus' });
