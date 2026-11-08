import { MediaUsePermission } from './enums';
import type { MediaUsePermission as MediaUsePermissionValue } from './enums';

export { MediaUsePermission } from './enums';

export type MediaPublicationRights = {
  readonly commercial: MediaUsePermissionValue;
  readonly noncommercial: MediaUsePermissionValue;
  readonly personal: MediaUsePermissionValue;
};

export type MediaPublicationMetadata = {
  readonly attributionName: string;
  readonly attributionUrl: string;
  readonly rights?: MediaPublicationRights;
};

export type MediaRightsProjection = MediaPublicationRights & {
  readonly holderName: string;
  readonly holderUrl: string;
  readonly licenseUrl: string;
};

export type MediaProviderPublicationMetadata = {
  readonly credit: string;
  readonly copyright?: string;
  readonly usageTerms?: string;
  readonly webStatement?: string;
};

export const MEDIA_USE_SCOPE_DESCRIPTIONS = {
  personal: '개인적이고 비상업적인 용도의 이용',
  noncommercial: '개인적 이용의 범위를 넘어서는 비상업적 활동에서의 이용',
  commercial: '사업상 이익이나 수익 창출을 목적으로 하는 이용',
} as const;

export const MEDIA_USE_PERMISSION_LABELS = {
  [MediaUsePermission.DENY]: '사용 금지',
  [MediaUsePermission.ORIGINAL]: '무수정 사용',
  [MediaUsePermission.EDIT]: '수정 가능',
} as const satisfies Record<MediaUsePermissionValue, string>;

export const MEDIA_USE_PERMISSION_DESCRIPTIONS = {
  [MediaUsePermission.DENY]: '해당 범위에서는 사용할 수 없습니다.',
  [MediaUsePermission.ORIGINAL]: '이미지 내용을 바꾸지 않고 사용할 수 있습니다.',
  [MediaUsePermission.EDIT]: '자르기나 이미지 내용 변경을 포함해 편집할 수 있습니다.',
} as const satisfies Record<MediaUsePermissionValue, string>;

export const MEDIA_USE_ATTRIBUTION_REQUIREMENT =
  '허용된 재사용에는 최초 작성자의 프로필 링크를 표시해야 합니다.';

export const MEDIA_USE_ORIGINAL_DESCRIPTION =
  '무수정 사용은 전체 크기 조정, 형식 변경, 압축을 허용합니다. 자르기나 이미지 내용 변경에는 수정 가능 허용이 필요합니다.';

const permissionRank: Record<MediaUsePermissionValue, number> = {
  [MediaUsePermission.DENY]: 0,
  [MediaUsePermission.ORIGINAL]: 1,
  [MediaUsePermission.EDIT]: 2,
};

export const isValidMediaPublicationRights = (rights: MediaPublicationRights): boolean =>
  permissionRank[rights.personal] >= permissionRank[rights.noncommercial] &&
  permissionRank[rights.noncommercial] >= permissionRank[rights.commercial];

export const mediaUseTermsUrl = (rights: MediaPublicationRights, origin: string): string =>
  new URL(
    `/terms/image-use/v1?personal=${rights.personal}&noncommercial=${rights.noncommercial}&commercial=${rights.commercial}`,
    origin,
  ).href;

export const mediaUseTermsText = (rights: MediaPublicationRights): string =>
  [
    ...(
      Object.keys(MEDIA_USE_SCOPE_DESCRIPTIONS) as (keyof typeof MEDIA_USE_SCOPE_DESCRIPTIONS)[]
    ).map(
      (scope) =>
        `${MEDIA_USE_SCOPE_DESCRIPTIONS[scope]}: ${MEDIA_USE_PERMISSION_LABELS[rights[scope]]}`,
    ),
    MEDIA_USE_ATTRIBUTION_REQUIREMENT,
    MEDIA_USE_ORIGINAL_DESCRIPTION,
  ].join('\n');

export const mediaProviderPublicationMetadata = (
  metadata: MediaPublicationMetadata,
): MediaProviderPublicationMetadata => ({
  credit: `${metadata.attributionName} (${metadata.attributionUrl})`,
  ...(metadata.rights === undefined
    ? {}
    : {
        copyright: `${metadata.attributionName} (${metadata.attributionUrl})`,
        usageTerms: mediaUseTermsText(metadata.rights),
        webStatement: mediaUseTermsUrl(metadata.rights, new URL(metadata.attributionUrl).origin),
      }),
});

export const matchesMediaProviderPublicationMetadata = (
  actual: MediaProviderPublicationMetadata | undefined,
  expected: MediaProviderPublicationMetadata,
): boolean =>
  actual !== undefined &&
  actual.credit === expected.credit &&
  actual.copyright === expected.copyright &&
  actual.usageTerms === expected.usageTerms &&
  actual.webStatement === expected.webStatement;
