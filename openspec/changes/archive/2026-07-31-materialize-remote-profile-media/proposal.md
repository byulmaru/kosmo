## Why

원격 ActivityPub actor가 `icon`과 `image`를 제공해도 현재 actor materialization은 Profile scalar와 endpoint만
저장하므로 GraphQL `Profile.avatar`와 `Profile.header`가 항상 비어 있다. 기존 Ready Remote Media와
ProfileMedia 조회 계약을 재사용해 최초 lookup과 refresh 모두에서 원격 Profile 표현을 실제로 보존해야 한다.

## What Changes

- actor의 embedded `icon`을 avatar로, embedded `image`를 header로 투영한다.
- 유효한 표현을 원본 Remote Profile 소유의 Ready Remote Media와 ProfileMedia 관계로 원자적으로 저장한다.
- 최초 materialization, stale refresh와 inbound `Update(Actor)`에서 표현 생성·교체·제거를 같은 경계로
  동기화한다.
- IRI-only 또는 부적합한 표현은 추가 fetch 없이 제외하고 기본 Profile materialization은 유지한다.
- Remote Media identity를 `(Remote Profile, canonical URL)` 범위로 정렬해 서로 다른 Profile이 같은 공용
  이미지 URL을 소유할 수 있게 한다.
- 기존 GraphQL schema와 앱 image/fallback 계약은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- Linear Contract: `PROD-625`
- Linear Implementations: `PROD-625`

## Capabilities

### New Capabilities

- `activitypub-remote-profile-media`: 원격 actor avatar/header 표현의 검증, 저장과 refresh 동기화

### Modified Capabilities

- `activitypub-remote-media`: Remote Media URL identity를 원본 Remote Profile 범위로 정렬

## Impact

- `packages/fedify`: 원격 actor 표현 projection과 materialization/Update 테스트
- `packages/core`: Remote Media uniqueness schema와 원격 Post Media 재사용 query
- `apps/api`: 기존 Profile avatar/header GraphQL 조회 회귀 검증
- Drizzle migration: Remote Media URL partial unique index를 Profile과 URL 복합 identity로 변경
- 외부 dependency, GraphQL schema와 client API 변경 없음
