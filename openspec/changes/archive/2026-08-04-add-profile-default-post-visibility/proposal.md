## Why

Local Profile은 새 게시물 작성에 사용할 기본 Post Visibility를 durable하게 소유하지 않으며, Profile Member가
조회하고 Owner가 변경할 수 있는 Backend 계약도 없다. DB/Core/GraphQL을 Relay·Composer·Settings UI와 분리해
Backend 결과를 client와 Storybook 상태에 관계없이 독립적으로 배포·검증·archive할 수 있게 한다.

## What Changes

- Local Profile에 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나인 기본 Post Visibility를 저장하고 기존·미설정
  Local Profile은 `UNLISTED`로 해석한다.
- Profile Member가 `Profile.private.defaultPostVisibility`를 조회하고 Local Profile Owner가 기존 Profile
  update 경계에서 변경할 수 있는 GraphQL projection·input·payload 계약을 제공한다.
- Remote Profile과 non-member에는 Kosmo Local 설정을 노출하거나 만들지 않고 `DIRECT`, 명시적 `null`과
  지원하지 않는 입력을 거부한다.
- Relay, Composer, Profile Settings UI, canonical `/settings` 연결과 Storybook 검증은 PROD-667의 별도
  Frontend change로 분리한다.
- 기존 Post Visibility, Repost, Quote Composer, `DIRECT` recipient와 ActivityPub 표현은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`,
  `docs/domain/objects/post.md`
- Linear Contract: `PROD-648`
- Linear Implementations: `PROD-648`; Frontend 소비와 UI는 `PROD-667`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: Local Profile 기본 Post Visibility의 Member 조회·Owner 변경과 GraphQL Profile 계약을 추가한다.
- `data-model`: Profile 기본 Post Visibility의 durable 저장값, 기존 row 호환 fallback과 허용 값 제약을
  추가한다.

## Impact

- `packages/core`: Profile table·migration, Local/Remote projection, 생성·조회·Owner update 정책 및 테스트
- `apps/api`: GraphQL `Profile.private.defaultPostVisibility` projection, optional update input/payload,
  membership 검증과 integration test
- `apps/app`, settings route·navigation, dependency와 ActivityPub actor 표현 변경 없음
