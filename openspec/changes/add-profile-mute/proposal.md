## Why

`PROD-824`가 영구 Profile Mute 관계와 권한 경계를 제공했지만, 현재 Post List는 이 관계를 노출 정책에
활용하지 않는다. `PROD-825`는 Mute를 접근 제한이 아닌 탐색 목록의 개인 노출 억제로 적용하고, 현재 제공
중인 목록에 Repost의 두 작성자 경계와 selected Profile 격리를 연결한다.

## What Changes

- Owner Profile에서 Target Profile로 향하는 영구 Profile Mute 관계, Owner·Target 조합의 고유성, nullable
  `expires_at`, 생성·해제 Core action과 Owner 전용 GraphQL 관리 계약을 제공한다.
- 기간 지정 입력과 만료 동작은 공개하지 않으며, v1 생성 경로는 `expires_at`에 항상 `null`을 기록한다.
- 현재 selected Profile이 Mute한 Target이 작성한 Home·Local 후보를 page limit 전에 제외한다.
- Repost Source가 있는 Home·Local 후보는 바깥 Post의 Author와 Source Post Author를 모두 판정하고, 둘 중 하나라도
  Mute Target이면 제외한다.
- Profile Post List에서는 방문한 Profile ID만 Mute 예외로 허용한다. 다른 muted Source Author의
  Repost·Quote는 제외하고 기존 Post Visibility·Eligibility와 PostConnection을 유지한다.
- Mute 해제 결과는 새 조회부터 목록 정책에 반영하며, 같은 Account의 다른 selected Profile이 가진 Mute 관계를
  섞지 않는다.
- Mute 생성·해제와 목록 판정은 기존 Follow Relationship, Follow Request, Reaction, Repost, Bookmark,
  Notification과 Read State를 변경하지 않는다.
- 기존 `postAccessWhere`에 Mute 조건을 통합하고 호출부가 전체 적용·방문한 Profile만 예외·전체 무시를
  명시한다. `PROD-825`가 Home·Local·Profile 적용과 Bookmark·직접 조회·상호작용 비적용을 소유한다.
  `PROD-827`은 Hashtag runtime에서 같은 경계를 재사용한다.
- Hashtag Post List API·projection과 해당 목록의 Profile Mute 통합은 `PROD-827`,
  UI·Relay·cross-slice E2E·archive는 `PROD-814`가 담당한다.
- 새 Notification 생성 억제, ActivityPub 전달과 기간 지정 Mute는 이번 change의 현재 구현 범위에 포함하지
  않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/design/profile-mute-block.md`
- Linear Contract: `PROD-814`
- Linear Implementations: 저장·권한·GraphQL 기반은 `PROD-824`, Post 조회 정책 통합과 Home·Local·Profile·Bookmark API 검증은 `PROD-825`,
  UI·Relay·통합 E2E와 archive는 `PROD-814`; Hashtag Post List runtime은 별도 `PROD-827`,
  기간 지정 Mute 결정은 `PROD-826`

## Capabilities

### New Capabilities

- `profile-mute`: 영구 Profile Mute의 저장·권한·적용 판정과 Owner 전용 GraphQL 관리 계약을 정의한다.

### Modified Capabilities

- `post`: Home·Local의 Profile Mute Exclude, Repost Author·Source Author 판정, Profile 직접 목록의 방문 ID 예외와
  Bookmark 비적용과 selected Profile별 새 조회 반영을 정의한다.

## Impact

- Database: `PROD-824`가 추가한 Profile Mute 관계 테이블과 index를 재사용하며 `PROD-825`에서 새 migration을
  만들지 않는다.
- API query: 기존 `postAccessWhere`가 현재 selected Profile의 Mute 조건과 Visibility·Eligibility를
  합성한다. Home·Local은 전체 적용, Profile은 방문한 Profile만 예외, Bookmark·직접 조회·상호작용은
  전체 무시를 명시한다. `PROD-827`은 Hashtag runtime에서 같은 경계를 재사용한다.
- GraphQL: Home·Local·Profile Post List 결과와 Bookmark 비적용. Mute 결과를 위한 새 Post field나 connection edge
  field는 추가하지 않는다.
- Tests: Home·Local·Profile·Bookmark GraphQL integration, pagination 전 제외, selected Profile 격리와
  해제 후 새 조회 회귀.
- Dependencies: 새 workspace 또는 runtime dependency는 추가하지 않는다.
