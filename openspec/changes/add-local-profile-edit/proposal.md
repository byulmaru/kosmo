## Why

Local Profile의 displayName, bio와 avatar/header를 수정할 production 화면과 안전한 저장 흐름이 없다. UI를 먼저
검증하려면 route·GraphQL과 분리된 presentation seam이 필요하지만, 실제 route는 selected Profile의 Local·Owner
권한을 server-authoritative하게 확인하기 전에는 노출할 수 없다. Profile Tag presentation은 같은 form에서 한 번만
만들고 별도 Tag change가 저장·공개 표시를 연결한다. Follow Approval Policy는 현재 Profile 편집 draft/save에
포함하며, Settings 진입점이 제공되면 `PROD-531`이 제어를 이전한다.

## What Changes

- route-independent `ProfileEditScreen`·`ProfileEditForm`이 displayName, bio, avatar/header controlled state와
  `followPolicy` enum draft, 한 줄 `팔로우 요청 자동 승인` Switch와 Profile Tag editor presentation을
  Web·Android·iOS 공용으로 제공한다. 현재 avatar/header는 초기 draft이며 별도
  `유지` action 없이 각 이미지의 편집 control만 해당 field draft를 변경한다.
- Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`로 해석하며, displayName·bio·avatar/header와 같은
  저장 callback에 포함한다. 정책 변경은 기존 Pending Follow Request의 상태나 존재를 바꾸지 않는다.
- 제출 callback이 없거나 바뀐 draft가 없으면 저장을 disabled로 표현하고
  dirty·validation·upload-wait·saving·failure·retry를 Storybook controlled state로 검증한다. 저장 성공 뒤에는
  presentation 문구를 남기지 않고 실제 route가 갱신된 Profile로 복귀한다.
- 실제 `/profile-edit` route는 usingProfile 경계의 selected Active/Normal Local Profile과 Owner Membership을
  확인하고 초기값, 저장, Media picker/upload 결과, Relay와 navigation을 연결한다.
- Web은 기존 shell의 최대 600px 중앙 route를 사용하고 1440/1024 단계와 mobile/native 정보 구조를 공유한다.
- header 이미지 변경 영역은 avatar·편집 action을 담는 hero wrapper와 분리하고 모든 지원 폭에서 가로:세로
  `3:1`을 유지한다. 원본 비율이 다르면 해당 preview 안에서 cover crop한다.
- Follow Approval Policy는 현재 Profile 편집 화면과 저장에 포함한다. Settings 진입점 제공 뒤 `PROD-531`이
  제어를 이전하고 Profile 편집의 중복 제어를 제거한다.
- Profile Tag 저장·Relay·공개 표시는 `add-profile-tags`의 `PROD-526`·`PROD-527`에 남긴다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`,
  `docs/design/profile-tags.md`
- Linear Contract: `PROD-490`
- Linear Implementations: `PROD-491` (presentation), `PROD-492` (route·API·Media 연결)
- Related contracts: `PROD-522`·`PROD-526`·`PROD-527` (Profile Tag), `PROD-531` (향후 Follow Approval Policy 이전)

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
- Excluded systems: Settings 전체 정보 구조와 `PROD-531`의 Follow Approval Policy 이전, Profile Tag
  storage/public display, Profile Link·handle, Media upload 인프라, crop editor, Admin role 제거
