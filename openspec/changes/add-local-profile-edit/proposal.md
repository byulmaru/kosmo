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
  확인하는 nullable `selectedProfileForEdit`을 사용한다. 공개 Profile의 편집 button은 이 결과가 현재 Profile과
  같을 때만 노출하며, guest·부적격 Account에는 오류 없이 `null`을 반환한다. 직접 route 진입은 편집 불가
  StateView로 방어한다.
- `PROD-581`의 Local Media 완료 metadata 위에 `profile_media` 관계를 추가하고, 생략=유지·Media ID=교체·
  `null`=제거 입력 의미와 selected Owner 권한 재검사를 포함해 text·policy·avatar/header를 원자적으로 저장한다.
- 공개 Profile 조회 정책을 통과한 viewer에게 Profile 관계의 avatar/header Media를 표시하고 `ProfileHero`를 실제
  이미지에 연결한다. 일반 Media Node의 owner-only 정책은 넓히지 않는다.
- route는 Media picker/upload 결과, field별 재시도, Ready ID 보존, Relay 정규화, dirty navigation 확인과 성공
  navigation을 연결한다. 저장 중에는 navigation을 차단한다.
- `PROD-613`은 Relay 성공 callback과 GraphQL body parse까지 끝난 뒤에도 Web `router.replace`가 실제로
  commit되기 전에 dirty·saving navigation guard가 REPLACE를 다시 막는 race를 수정한다. 성공 저장은 제출
  draft를 clean baseline으로 확정하고 terminal UI에서 one-shot REPLACE를 실행한다. clean baseline이 유지되면
  늦은 `beforeRemove`를 허용하고, commit 전 새 draft가 생기면 그 입력을 discard confirmation으로 보호한다.
  navigation no-op·실패에서도 Ready Media ID를 보존하고 mutation 자동 재전송이나 이미지 자동 재업로드를
  실행하지 않는다.
- Web은 기존 shell의 최대 600px 중앙 route를 사용하고 1440/1024 단계와 mobile/native 정보 구조를 공유한다.
- header 이미지 변경 영역은 avatar·편집 action을 담는 hero wrapper와 분리하고 모든 지원 폭에서 가로:세로
  `3:1`을 유지한다. 원본 비율이 다르면 해당 preview 안에서 cover crop한다.
- Follow Approval Policy는 현재 Profile 편집 화면과 저장에 포함한다. Settings 진입점 제공 뒤 `PROD-531`이
  제어를 이전하고 Profile 편집의 중복 제어를 제거한다.
- Profile Tag 저장·Relay·공개 표시는 `add-profile-tags`의 `PROD-526`·`PROD-527`에 남긴다.
  PROD-492 production route에서는 Tag UI와 mutation input을 모두 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`,
  `docs/design/profile-tags.md`
- Linear Contract: `PROD-490`
- Linear Implementations: `PROD-491` (presentation), `PROD-492` (route·API·Media 연결), `PROD-613`
  (post-commit 응답·Relay·navigation 회귀 조사와 수정)
- Blocking implementation: `PROD-581` (Local Media 완료 시 공개 URL·media type metadata 저장)
- Related contracts: `PROD-522`·`PROD-526`·`PROD-527` (Profile Tag), `PROD-531` (향후 Follow Approval Policy 이전)

## Capabilities

### New Capabilities

- `profile-edit-ui`: route-independent form, controlled state, responsive layout, 접근성과 production route 연결 경계

### Modified Capabilities

- `profile`: selected Local Profile Owner update와 avatar/header Ready Local Media 관계 변경 계약을 추가한다.
- `web-app-shell`: protected Profile 편집 route를 기존 shell 중앙 컬럼에 표시하고 권한 없는 진입을 노출하지 않는다.

## Impact

- Universal client: Profile edit presentation, Storybook states, 실제 protected route, Relay와 navigation
- Database/API/Core: additive `profile_media` 관계, guest-safe selected Local Owner query, action 시작 시 권한 재검사,
  legacy displayName validation과 avatar/header tri-state 입력·원자성
- Media/Profile read: `PROD-581` metadata를 소비하고 같은 Profile의 Ready Local Media만 연결하며, 교체·제거 때
  Media 자체를 보존하고 공개 ProfileHero에 viewer-authorized avatar/header를 표시
- Profile Tag: `PROD-491` presentation을 `PROD-527`이 재사용하며 이 change는 저장·공개 표시를 완료로 간주하지 않음
- Verification: DB 제약·초기 부적격 권한 거부·guest/public read, API/Core text·Media 원자성, Relay·부분 upload 재시도,
  Web의 비동기 `beforeRemove`·clean baseline·commit 전 새 draft 보호와 terminal state, Web/native dirty route와
  부모 종단 간 검증
- Excluded systems: Settings 전체 정보 구조와 `PROD-531`의 Follow Approval Policy 이전, Profile Tag
  storage/public display, Profile Link·handle, Media upload 인프라, crop editor, Admin role 제거, orphan Media cleanup,
  thumbnail·variant·Remote Media와 Fedify/ActivityPub
