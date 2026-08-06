## Why

Backend가 Local Profile별 기본 Post Visibility를 제공해도 유니버설 앱은 값을 조회·변경하거나 새 Composer의
초기값으로 사용하지 않는다. Profile Owner가 canonical `/settings`에서 기본값을 관리하고 새 일반 Post·Reply가
그 값을 안전하게 소비하도록 Frontend 행동과 검증 책임을 Backend lifecycle에서 분리한다.

## What Changes

- Relay Profile fragment와 기존 `updateProfile` mutation으로 기본 Post Visibility를 읽고 저장된 Profile
  record에 수렴한다.
- 현재 Local Profile을 식별하는 설정 control에 Owner 편집, Member 비편집, dirty·pending·success·error·retry와
  늦은 completion 격리를 제공하고 canonical `/settings`의 Profile 영역에 연결한다.
- 새 일반 Post·Reply Composer가 selected Profile의 기본값으로 시작하고 unavailable 상태에서는 다른 Profile
  값을 재사용하지 않고 `UNLISTED`로 fallback한다.
- 열린 draft와 Profile 설정 변경을 독립시키고 selected Profile·Reply Parent·Relay Environment가 바뀔 때만
  새 문맥의 기본값으로 새 draft를 시작한다.
- DB/Core/GraphQL, Quote Composer, Repost와 `DIRECT` recipient·옵션 복원은 추가하거나 변경하지 않는다.
  향후 Quote가 같은 Profile 기본값을 소비한다는 기존 제품 방향은 현재 구현·검증·archive gate로 삼지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`,
  `docs/design/reply-composer.md`, `docs/design/settings.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-667`
- Linear Implementations: `PROD-667`; Backend API 계약은 `PROD-648`, generic `/settings` route·page shell과
  페이지 수준 정보 구조는 `PROD-653`, Byulmaru ID Account entry는 `PROD-645`

## Capabilities

### New Capabilities

- `profile-default-post-visibility-settings`: Relay Profile 값을 소비하는 기본 공개 범위 설정 control, 상태·권한·
  접근성 및 canonical `/settings` Profile 연결을 정의한다.

### Modified Capabilities

- `post`: 현재 존재하는 새 일반 Post·Reply Composer의 Profile별 초기 Visibility, fallback, 열린 draft 독립성과
  문맥 격리 계약을 추가한다.

## Impact

- `apps/app`: Relay Profile fragment와 mutation, Profile 설정 control, Post/Reply Composer 초기화·reset·문맥
  격리, canonical `/settings` Profile 연결 및 Storybook·component 검증
- `docs/design/reply-composer.md`: 기존 Profile 기본값 소비 계약의 구현 이슈 provenance 정렬
- `PROD-653`: generic settings host는 Profile child를 재구현하지 않고 PROD-667 결과를 조립한다.
- `packages/core`, `apps/api`, DB migration, ActivityPub actor와 federation payload 변경 없음
