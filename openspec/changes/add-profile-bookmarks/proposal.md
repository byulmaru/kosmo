## Why

Profile이 조회 가능한 Post를 개인적으로 저장하고 다시 찾을 수 있다는 도메인 계약은 확정되어 있지만, 저장 모델부터 API와 클라이언트까지 연결하는 활성 OpenSpec 계약과 구현은 아직 없다. [PROD-391](https://linear.app/byulmaru/issue/PROD-391/bookmark-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)이 소유하는 하나의 공유 계약으로 저장·생성·삭제·목록·클라이언트 동작을 정렬해야 각 구현 조각을 독립적으로 리뷰하면서도 최종 사용자 흐름을 함께 검증할 수 있다.

## What Changes

- Bookmark의 Owner Profile, Target Post, 불변 생성 시각, Profile/Post 유일성 및 최신순 조회에 필요한 저장 계약을 추가한다.
- Active Local Profile만 조회 가능한 Post를 저장하고 자신의 Bookmark만 삭제할 수 있는 생성·삭제 계약을 추가한다.
- Owner Profile만 자신의 Bookmark를 안정적인 최신순 페이지로 조회하며, 현재 조회할 수 없는 Target Post는 결과에서 숨기되 저장 관계는 유지하는 목록 계약을 추가한다.
- Post별 selected Profile의 Bookmark 관계를 조회하는 viewer-relative API와 개인 Bookmark 목록 화면을 제공한다.
- 저장, 생성·삭제 API, 목록 API, viewer-relative 조회 API, 목록 presentation, 실제 route 통합을 `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-452`, `PROD-421`의 독립 구현·검증 단위로 나누고, 부모 `PROD-391`에서 통합 흐름과 OpenSpec archive를 소유한다.
- Bookmark action adapter와 pending·실패 UX, Relay mutation/cache 처리, 공통 Post Action Bar 및 production surface rollout은 `PROD-432/433/434`가 소유하며 이 변경에서 제외한다.
- 공개 Bookmark, Folder/Collection/태그 분류, Post Media, Notification 및 ActivityPub federation은 이 변경에서 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`
- Linear Contract: `PROD-391`
- Linear Implementations: `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-421`

## Capabilities

### New Capabilities

- `bookmark`: 개인 Bookmark의 저장, 권한, 생성·삭제, 최신순 비공개 목록, Target Post 가시성 처리와 viewer-relative 조회 계약

### Modified Capabilities

- `data-model`: Bookmark 식별자, 관계, 유일성, 생성 시각과 안정적인 최신순 조회를 지원하는 영속 모델을 추가한다.
- `web-app-shell`: 보호된 Bookmark 목록 route를 추가한다.
- `universal-expo-client`: Android, iOS, Web이 같은 Bookmark 목록 route와 공용 component 동작을 제공하도록 지원 route parity를 확장한다.

## Impact

- `packages/core`: Drizzle table/migration, 검증된 Profile/Post 관계의 Bookmark 생성·삭제 persistence action과 DB/service 검증
- `apps/api`: Bookmark 생성·삭제 mutation, Account/Profile/Post 권한·가시성 검사, 비공개 connection, Relay Node와 `Post.viewerBookmark` 경계 및 GraphQL 검증
- `apps/app`, `apps/web`: Bookmark 목록 route/component와 selected Profile별 pagination 상태 처리
- PostgreSQL에는 additive Bookmark table, 유일 제약과 개인 최신순 조회 index가 추가된다. 기존 데이터 backfill이나 외부 dependency 추가는 없다.
- canonical 근거인 `docs/domain/objects/bookmark.md`와 `docs/domain/decisions/0010-post-interaction-contracts.md`도 UUIDv7 ID-only 순서와 Target Post 물리 삭제 lifecycle에 맞춘다.
