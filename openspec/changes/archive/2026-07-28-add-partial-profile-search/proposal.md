## Why

현재 사람 검색은 exact handle 단건 조회만 지원해 사용자가 handle 일부만 알고 있으면 저장된 프로필을 찾을 수 없다. PROD-504는 기존 handle 해석과 프로필 노출 정책을 유지하면서 DB `LIKE` 부분 일치 결과를 안정적인 cursor pagination 목록으로 제공한다. 검색 대상은 이미 저장된 local·remote Profile이며, 검색 중 remote lookup·refresh·신규 materialization은 수행하지 않는다.

## What Changes

- 기존 exact `profileByHandle` 계약은 프로필 route와 다른 소비자를 위해 유지하고, 사람 검색용 `searchProfiles(query:, first:, after:): ProfileConnection!`을 추가한다.
- bare/local-domain 입력은 configured local Instance, remote-domain 입력은 해당 ActivityPub Instance에 이미 저장된 Profile을 대상으로 기존 handle 정규화 경계를 유지한다.
- ADR 0017의 현재 staged visibility에 따라 exact·partial lookup 모두 configured local Instance의 `ProfileState.ACTIVE` Profile과, remote branch의 `ProfileState.ACTIVE` Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance에 속한 Profile만 포함한다. Domain Limit Instance와 viewer Profile Domain Block은 최종 canonical moderation 정책이며, 저장 모델과 공통 predicate를 도입한 후 exact·partial을 함께 전환하는 후속 범위이지 PROD-504의 선행 조건이 아니다.
- 정규화된 handle 검색어의 SQL `LIKE` 메타문자(`%`, `_`, escape 문자)는 리터럴로 처리하고, 부분 일치용 `%`는 escape 뒤 양쪽에 별도로 추가하며 parameter binding을 유지한다.
- 단일 Instance 범위에서 유일한 `normalizedHandle ASC`를 cursor 순서로 사용하고 `first`/`after` 페이지 사이 중복·누락 없이 결과 비용을 제한한다.
- 사람 검색 UI는 Relay connection과 `usePaginationFragment`로 페이지를 누적해 기존 `ProfileListItem`과 팔로우 액션 정책으로 표시하며 초기·다음 페이지 로딩/오류/재시도와 빈 결과 상태를 제공한다.
- 검색 중 WebFinger, actor fetch, remote profile refresh 또는 신규 Profile materialization을 수행하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md` (최종 moderation 정책), `docs/domain/decisions/0017-profile-search-staged-visibility.md` (현재 staged visibility); applicable `docs/design`: 없음.
- Linear Contract: `PROD-504`
- Linear Implementations: 없음 — small change인 `PROD-504`가 구현·검증·통합 완료를 함께 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: 저장된 local/remote Profile을 기존 handle 해석 경계 안에서 부분 일치 cursor connection으로 조회하는 API 계약을 추가한다.
- `web-app-shell`: 사람 탭의 exact 단건 결과 표시를 Relay pagination 가능한 부분 일치 목록으로 변경한다.

## Impact

- GraphQL profile query schema/resolver와 API 통합 테스트
- Expo SearchScreen의 colocated Relay query, 다건 `ProfileListItem` 렌더링, Storybook/E2E 상태
- `openspec/specs/profile/spec.md`, `openspec/specs/web-app-shell/spec.md`
- DB schema·migration·dependency 변경 없음
