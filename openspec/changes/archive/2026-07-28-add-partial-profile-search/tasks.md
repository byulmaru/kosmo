## 1. PROD-504 부분일치 사람 검색

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0003-policy-ownership-clarifications.md`
- `docs/domain/decisions/0004-review-consistency-clarifications.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md` (ADR 0017)
- `PROD-504`

**Deliverable**

사용자가 사람 탭에서 기존 handle 해석 정책에 맞는 일부 문자열을 검색하면 DB에 저장된 local 또는 지정 domain의 remote Profile 중 부분 일치하는 결과를 안정적인 cursor pagination으로 탐색하고 기존 프로필 항목·링크·팔로우 상태로 볼 수 있다.

**Guardrails**

- 기존 exact `profileByHandle` 단건 계약과 그 소비자를 유지하고, `searchProfiles(query:, first:, after:): ProfileConnection!`으로 사람 검색을 제공한다.
- 사용자 입력의 escape 문자, `%`, `_`를 리터럴로 escape한 뒤 부분일치용 `%`를 양쪽에 추가하고 SQL parameter binding을 유지한다.
- 단일 Instance 범위에서 immutable하고 유일한 `Profile.id ASC`를 cursor 순서로 사용하고 `first`/`after` 페이지 사이 중복·누락을 막는다. 페이지 사이 normalized handle이 변경되어도 ID cursor 경계를 유지하며, 검색 index와 DB migration은 추가하지 않는다.
- 기존 `profileByHandle`과 동일하게 configured local Instance의 `ProfileState.ACTIVE` Profile 및 입력 domain의 ActivityPub Instance에 이미 저장된 `ProfileState.ACTIVE` Remote Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance의 Profile만 포함하고, 새로운 visibility 정책·데이터 모델·DB migration을 추가하지 않는다.
- 검색 중 WebFinger, actor document fetch·refresh 또는 remote Profile 저장(새 materialization)을 수행하지 않는다.
- Domain Limit Instance와 viewer Profile Domain Block 대상 Instance는 최종 canonical moderation 정책으로 유지하되, ADR 0017에 따라 해당 저장 모델·공통 predicate 도입은 현재 exact/partial 검색의 선행 조건이 아니며 후속 rollout에서 두 조회를 함께 전환한다.
- display name, 게시글·미디어 검색으로 범위를 넓히지 않는다.

**Verification**

- API 통합 테스트로 local/remote 부분일치, `Profile.id ASC` cursor page의 중복·누락 방지와 페이지 사이 normalized handle 변경 안정성, empty, 정규화, `%`·`_`·escape 문자, 검색 visibility와 remote no-materialization을 검증한다.
- 검색 페이지 Story/E2E로 다건 `ProfileListItem`, profile link·follow 상태, empty, wildcard 입력과 초기·다음 페이지 loading/error/retry/종료 상태를 검증한다.
- GraphQL schema와 Relay query 계약을 동기화하고 관련 typecheck/check를 통과시킨다.
- DB schema·migration diff가 없고 기존 exact lookup 회귀 테스트가 통과하는지 확인한다.

- [x] 1.1 기존 exact lookup을 보존하면서 부분일치 Profile을 반환하는 `searchProfiles` connection GraphQL 계약을 구현한다.
- [x] 1.2 기존 local/remote handle 해석과 exact 조회의 Profile/Instance 노출 조건을 재사용하고 remote materialization 없이 다건 조회한다.
- [x] 1.3 입력 `LIKE` 메타문자 escape, 부분일치 wildcard 추가 순서와 SQL parameter binding을 구현한다.
- [x] 1.4 API 통합 테스트에 부분일치·cursor pagination 중복/누락 방지·empty·정규화·wildcard·visibility·no-materialization 시나리오를 추가하고 통과시킨다.
- [x] 1.5 사람 탭 Relay connection과 `usePaginationFragment` 렌더링으로 전환하고 기존 링크·팔로우·loading/error/empty 계약 및 다음 페이지 loading/error/retry/종료를 유지한다.
- [x] 1.6 검색 Story/E2E를 다건·pagination·empty·wildcard 결과 shape에 맞춰 갱신하고 관련 검증을 통과시킨다.
- [x] 1.7 GraphQL schema/Relay 계약, 관련 typecheck/check와 기존 exact lookup 회귀 검증을 완료하고 DB migration이 없음을 확인한다.
