## Why

일반 Post와 Reply Composer가 공개 범위를 항상 `UNLISTED`로 시작해, 여러 Local Profile을 운영하는 Account가
Profile별 게시 성격에 맞는 기본값을 유지할 수 없다. Local Profile이 자신의 기본 게시 공개 범위를 소유하고
새 Composer가 그 값을 안전하게 소비하도록 해 반복 선택을 줄이면서 Profile 간 설정과 draft 격리를 보장한다.

## What Changes

- Local Profile에 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나인 기본 Post Visibility를 저장하고, 기존·미설정
  Profile은 `UNLISTED`로 해석한다.
- Profile Member가 기본값을 조회해 새 Post·Reply Composer 초기값으로 사용할 수 있게 하되, Local Profile
  Owner만 설정을 변경할 수 있게 한다.
- 설정 control에 현재 대상 Profile, dirty·pending·success·error·retry 상태를 제공하고 Profile 또는 Relay
  Environment 전환의 늦은 응답을 격리한다.
- Composer의 개별 Visibility 변경은 Profile 기본값을 바꾸지 않으며, 열린 draft는 설정 변경으로 자동
  덮어쓰지 않는다. 새 문맥과 다음 새 Composer만 최신 기본값을 사용한다.
- 설정 조회 실패나 unavailable 상태에서는 다른 Profile 값을 재사용하지 않고 `UNLISTED`로 fallback한다.
- `DIRECT`와 Mentioned Profiles, Repost visibility 파생, 기존 Post visibility 변경, Quote 작성 기능 자체는
  추가하지 않는다. 향후 Quote Composer는 같은 Profile 기본값 계약을 소비한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`,
  `docs/domain/policies/post-list.md`, `docs/design/reply-composer.md`
- Linear Contract: `PROD-648`
- Linear Implementations: `PROD-648`; `/settings` 공통 route·page shell과 최종 페이지 통합은 `PROD-653`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: Local Profile이 기본 Post Visibility를 소유하고 Member 조회·Owner 변경 권한을 적용한다.
- `post`: 새 Post·Reply·Quote Composer의 Profile별 초기 Visibility, fallback, draft 독립성과 문맥 격리 계약을
  추가한다.
- `data-model`: Profile 기본 Post Visibility의 durable 저장값, 기존 row 호환 기본값과 허용 값 제약을 추가한다.

## Impact

- `packages/core`: Profile table·migration과 Profile 설정 조회·변경 정책 및 테스트
- `apps/api`: GraphQL `Profile` 설정 field, 변경 input/payload, enum 검증과 integration test
- `apps/app`: Relay Profile fragment, Profile 설정 control, Post/Reply Composer 초기화·reset·문맥 격리와
  Storybook 검증
- `PROD-653`: 현재 change가 제공하는 Profile 설정 component를 canonical `/settings` page shell에 통합하는
  후속 페이지 수준 검증
- dependency 또는 ActivityPub actor 표현 변경 없음
