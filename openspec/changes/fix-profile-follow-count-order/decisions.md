## Context

`fix-profile-follow-count-order`의 proposal과 web-app-shell delta spec에 기록된 팔로우 수 표시 순서 결정을 ADR 형식으로 정리한다.

## Decision Records

### 팔로우 수 표시는 팔로잉 다음 팔로워 순서로 맞춘다

- Status: Accepted
- Context / Problem: `ProfileHero`와 `SidebarNavigation`의 팔로우 수 표시 순서가 의도와 반대인 `팔로워 -> 팔로잉`으로 되어 있다.
- Decision Outcome: 두 surface 모두 `팔로잉 -> 팔로워` 순서로 정정하고, following count와 followers count 라벨을 각각 맞춘다.
- Alternatives Considered: 기존 순서를 유지할 수 있지만 목록 라우트 진입점 추가 전 표시 정책을 바로잡지 못한다.
- Consequences: GraphQL fragment나 API shape는 바꾸지 않고 UI 표시 순서만 수정한다.
- Confirmation / Follow-up: `ProfileHero`와 `SidebarNavigation` 렌더 결과에서 값과 라벨이 어긋나지 않는지 확인한다.

## Remaining Decisions

- 팔로잉/팔로워 수에서 목록 라우트로 가는 링크 연결은 별도 변경에서 다룬다.
- ActivityPub followers/following collection 연동은 이번 범위 밖이다.

## Superseded Decisions

- 없음.
