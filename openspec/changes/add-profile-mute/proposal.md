## Why

기준 문서에서 Profile Mute는 Owner Profile이 Target Profile의 노출을 줄이는 관계다. 현재 구현에는 이 관계를
저장하고 판정하거나 관리할 DB·Core·GraphQL 기능이 없다. `PROD-825`의 콘텐츠 정책과 `PROD-814`의 UI·Relay
통합에 앞서 `PROD-824`가 영구 Mute 관계와 권한 경계를 먼저 제공해야 한다.

## What Changes

- Owner Profile에서 Target Profile로 향하는 Profile Mute 관계를 저장하고 같은 Owner·Target 조합의 중복을
  막는다.
- nullable `expires_at`을 저장 모델에 포함하되, v1 생성 경로는 항상 `null`을 기록하고 기간 입력·변경·만료
  동작을 공개하지 않는다.
- 검증된 Owner Profile이 Local 또는 Remote Target Profile을 영구 Mute하고 해제할 수 있도록 transport-neutral
  Core action을 추가한다.
- 현재 selected Profile이 소유한 Mute 관계 목록과 Target 기준 상태를 조회하고 생성·해제할 수 있는 GraphQL
  계약을 추가한다.
- GraphQL 인증, Owner 권한과 selected Profile 격리를 적용하고 다른 Account나 같은 Account의 다른 selected
  Profile 관계를 노출하거나 변경하지 않는다.
- 저장·Core·GraphQL 테스트로 Local·Remote Target, 중복 생성, 해제, 권한과 selected Profile 격리를 검증한다.
- Profile Mute를 만들거나 해제해도 기존 Follow Relationship, Follow Request, Reaction, Repost, Bookmark,
  Notification과 Read State를 변경하지 않는다.
- 콘텐츠 목록의 Exclude·Collapse 정책 구현, UI·Relay 관리 흐름, Notification 생성 억제, ActivityPub 전달,
  기간 지정 Mute와 전체 E2E·archive는 이번 구현 slice에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/design/profile-mute-block.md`
- Linear Contract: `PROD-814`
- Linear Implementations: `PROD-824`; 후행 콘텐츠 정책은 `PROD-825`, UI·Relay·통합 E2E와 archive는
  `PROD-814`, 기간 지정 Mute 결정은 `PROD-826`

## Capabilities

### New Capabilities

- `profile-mute`: 영구 Profile Mute의 저장·권한·적용 판정과 Owner 전용 GraphQL 관리 계약을 정의한다.

### Modified Capabilities

- 없음.

## Impact

- Database: Profile Mute 관계 테이블, Owner·Target foreign key와 unique constraint, nullable `expires_at`, 조회와
  pagination에 필요한 index, additive migration.
- Core: transport-neutral 생성·해제 action, domain error와 동시성 수렴.
- GraphQL: Profile Mute Node·viewer-relative 상태·Owner 전용 connection, 생성·해제 mutation과 공개 schema.
- Tests: migration/schema, Core service, GraphQL integration과 Local·Remote Target·selected Profile 격리 회귀.
- Dependencies: 새 workspace 또는 runtime dependency는 추가하지 않는다.
