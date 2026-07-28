## Why

Local Profile의 displayName, bio와 avatar/header를 수정할 production 화면과 안전한 저장 흐름이 없다. UI를 먼저
검증하려면 route·GraphQL과 분리된 presentation seam이 필요하지만, 실제 route는 selected Profile의 Local·Owner
권한을 server-authoritative하게 확인하기 전에는 노출할 수 없다. Profile Tag presentation은 같은 form에서 한 번만
만들고 별도 Tag change가 저장·공개 표시를 연결하며, Follow Approval Policy는 Settings 계약으로 분리한다.

## What Changes

- route-independent `ProfileEditScreen`·`ProfileEditForm`이 displayName, bio, avatar/header controlled state와
  Profile Tag editor presentation을 Web·Android·iOS 공용으로 제공한다. 현재 avatar/header는 초기 draft이며 별도
  `유지` action 없이 각 이미지의 편집 control만 해당 field draft를 변경한다.
- 제출 callback이 없거나 바뀐 draft가 없으면 저장을 disabled로 표현하고
  dirty·validation·upload-wait·saving·success·failure·retry를 Storybook controlled state로 검증한다.
- 실제 `/profile-edit` route는 usingProfile 경계의 selected Active/Normal Local Profile과 Owner Membership을
  확인하고 초기값, 저장, Media picker/upload 결과, Relay와 navigation을 연결한다.
- Web은 기존 shell의 최대 600px 중앙 route를 사용하고 1440/1024 단계와 mobile/native 정보 구조를 공유한다.
- header 이미지 변경 영역은 avatar·편집 action을 담는 hero wrapper와 분리하고 모든 지원 폭에서 가로:세로
  `3:1`을 유지한다. 원본 비율이 다르면 해당 preview 안에서 cover crop한다.
- Follow Approval Policy는 이 화면과 저장에서 제외하고 `PROD-531` Settings 계약에 남긴다.
- Profile Tag 저장·Relay·공개 표시는 `add-profile-tags`의 `PROD-526`·`PROD-527`에 남긴다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`,
  `docs/design/profile-tags.md`
- Linear Contract: `PROD-490`
- Linear Implementations: `PROD-491` (presentation), `PROD-492` (route·API·Media 연결)
- Related contracts: `PROD-522`·`PROD-526`·`PROD-527` (Profile Tag), `PROD-531` (Follow Approval Policy Settings)

## Capabilities

### New Capabilities

- `profile-edit-ui`: route-independent form, controlled state, responsive layout, 접근성과 production route 연결 경계

### Modified Capabilities

- `profile`: selected Local Profile Owner update와 avatar/header Ready Local Media 관계 변경 계약을 추가한다.
- `web-app-shell`: protected Profile 편집 route를 기존 shell 중앙 컬럼에 표시하고 권한 없는 진입을 노출하지 않는다.

## Impact

- Universal client: Profile edit presentation, Storybook states, 실제 protected route, Relay와 navigation
- API/Core: selected Local Owner capability/query, displayName·bio validation, avatar/header Media 관계와 원자성
- Media: 같은 Profile의 Ready Local Media만 연결하고 교체·제거 때 Media 자체는 보존
- Profile Tag: `PROD-491` presentation을 `PROD-527`이 재사용하며 이 change는 저장·공개 표시를 완료로 간주하지 않음
- Verification: component·접근성·responsive state, API/Core 권한·Media 통합, Web/native route와 부모 종단 간 검증
- Excluded systems: Follow Approval Policy Settings, Profile Tag storage/public display, Profile Link·handle,
  Media upload 인프라, crop editor, Admin role 제거
