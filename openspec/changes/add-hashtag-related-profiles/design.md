## Context

PROD-526이 `hashtag`와 `profile_hashtag` 저장 구조, Hashtag Node, `Profile.tags` 공개 조회를 main에 추가했다. `profile_hashtag`는 `(profile_id, hashtag_id)`를 unique로 제한하고 `hashtag_id` index를 가지지만, Hashtag에서 Profile로 역조회하는 GraphQL field는 아직 없다.

현재 API는 `ProfileConnection`을 공용 Profile node connection으로 사용하고, cursor connection resolver에서 SQL cursor predicate·정렬·limit을 함께 적용한다. Account 로그인은 GraphQL field의 `login` scope가 resolver 실행 전에 확인하며, Profile 공개 조건은 `visibleProfileWhere`가 Active Profile과 non-suspended Instance를 SQL에서 필터링한다. 이 공용 predicate만으로는 Remote Profile을 제외하지 않으므로 관련 Profile 목록에는 Local Instance 조건이 추가로 필요하다.

이번 change는 PROD-525가 소유하는 전체 탐색 계약의 첫 구현 slice다. PROD-528은 API와 API 검증만 제공하고, PROD-529가 이후 같은 change에 client/navigation 요구사항과 task를 추가한다.

## Goals / Non-Goals

**Goals:**

- 기존 Hashtag global identity에서 관련 공개 Local Profile을 조회하는 additive GraphQL connection을 제공한다.
- 인증, exact relation, visibility와 Local 조건을 candidate SQL과 page limit 전에 적용한다.
- 기존 Profile node/connection과 ID cursor 관례를 재사용하면서 기본·최대 page 크기를 20개로 고정한다.
- 성공·빈 결과·인증 실패·visibility·Remote 제외·cursor pagination과 기존 검색 회귀를 API 경계에서 증명한다.

**Non-Goals:**

- Hashtag 이름 입력, `#` 모드, 자동완성, Hashtag/Hashtag Name 검색
- 기존 `searchProfiles`와 `profileByHandle` 계약 변경
- Remote Profile lookup·refresh·materialization과 ActivityPub 확장
- client route, TagChip interaction, Relay pagination UI, loading/error/retry presentation
- DB schema·migration·index 또는 dependency 변경

## Implementation Guidance

### Current Constraints

- `Hashtag` Node는 global ID와 공개 표시 `name`만 제공하며 관계 field가 없다. parent Node가 존재하지 않으면 기존 Node lookup이 `null`을 소유하고, 존재하는 Hashtag에 관련 Profile이 없으면 새 field가 빈 connection을 소유해야 한다.
- 공용 `ProfileConnection`은 재사용할 수 있지만 builder 전역에는 page max가 설정되어 있지 않다. 새 field가 자체적으로 default/max 20을 전달하지 않으면 oversized 요청이 canonical 비용 상한을 넘을 수 있다.
- 자동 connection helper는 `before`·`last`까지 schema에 노출할 수 있다. 승인된 public API는 `first`·`after` forward pagination이므로 schema args를 명시적으로 소유해야 한다.
- `visibleProfileWhere`는 Active와 non-suspended만 검사하고 Local/Remote를 구분하지 않는다. `Instances.kind=LOCAL`을 별도로 적용하지 않으면 인위적이거나 미래의 Remote Profile Tag 관계가 노출될 수 있다.
- application filtering이나 Profile Node 재로딩에 visibility를 맡기면 page가 짧아지거나 cursor 사이 결과가 누락될 수 있다. 후보 SQL이 최종 node visibility를 만족해야 한다.
- `ProfileHashtags` unique constraint 덕분에 exact Hashtag 하나에 같은 Profile row가 중복될 수 없으므로, 별도 `DISTINCT`로 query 계획을 복잡하게 만들 필요는 없다.

### Recommended Approach

기존 `Hashtag` Node에 field-level `login` auth scope를 적용한 `relatedProfiles` field를 추가한다. field는 공용 `ProfileConnection`을 반환하되 `first`와 `after`만 명시적으로 받고, 기존 cursor connection utility에 `defaultSize: 20`, `maxSize: 20`, `Profile.id` cursor를 전달한다.

resolver는 `ProfileHashtags`에서 `Profiles`와 `Instances`를 join하고 parent `Hashtag.id` exact predicate, Local Instance kind, 공용 Profile visibility, `after`의 `Profile.id` 경계를 하나의 SQL `WHERE`에 적용한다. 결과는 `Profile.id ASC`로 정렬하고 connection utility가 요구하는 limit만 조회한다. 이미 visibility를 통과한 Profile row를 edge node로 반환해 추가 lookup과 application filtering을 피한다.

resolver module은 Hashtag 관계 책임 아래 조립하고, Profile ref/connection은 기존 공개 타입을 재사용한다. runtime schema를 생성한 뒤 `apps/api/schema.graphql`을 같은 변경에서 동기화한다.

통합 테스트는 field scope가 후보 query 전에 실패하는지 SQL 관찰 지점으로 확인하고, selected Profile 없는 Session 성공, exact/other Hashtag 분리, Active·Normal Local 포함, 비공개·suspended·Remote 제외, 빈 connection, 20개 clamp와 2-page 중복·누락 방지를 각각 검증한다. 기존 `searchProfiles`와 공개 Profile lookup 회귀도 유지한다.

### Allowed Alternatives

spec의 `Hashtag.relatedProfiles` shape, `login` 선행 평가, exact identity, Local/visibility filter-before-limit, `Profile.id ASC` cursor와 20개 상한을 모두 보존한다면 동등한 Pothos field 구성과 SQL query 조립 방식은 허용한다. 별도 core service는 다른 진입점이 같은 조회를 즉시 공유해야 하는 근거가 생길 때만 허용하며, 현재 GraphQL 전용 read query를 위해 선제 도입하지 않는다.

### Known Traps

- `usingProfile` scope를 사용해 selected Profile 없는 Account를 거부하지 않는다.
- Hashtag `name`을 resolver 입력으로 받아 정규화·부분 검색하지 않는다.
- relation row ID나 `createdAt`을 cursor로 사용해 Profile cursor 계약을 바꾸지 않는다.
- Remote exclusion을 Profile Node loader나 현재 데이터 모양에 암묵적으로 맡기지 않는다.
- SQL limit 이후 application filtering으로 숨겨진 Profile을 제거하지 않는다.
- page 상한을 API 전역 설정으로 바꿔 다른 connection의 공개 계약에 영향을 주지 않는다.
- PROD-529 client/navigation 파일이나 analytics를 이번 branch에 섞지 않는다.

## Risks / Trade-offs

- [UUIDv7 `Profile.id ASC`는 같은 millisecond 안의 생성 순서를 표현하지 않는다] → 이 목록은 시간순 의미를 요구하지 않으며 immutable·unique 전체 순서만 사용한다는 결정을 명시한다.
- [결과 집합이 page 사이에 변경되면 새 관계가 이미 지난 cursor 앞에 들어갈 수 있다] → cursor 계약은 변경되지 않은 결과 집합의 중복·누락 방지를 보장하고 snapshot pagination은 도입하지 않는다.
- [Hashtag Node가 공개 lookup 가능하므로 비로그인 요청이 parent Hashtag 존재를 확인할 수 있다] → 기존 Hashtag Node 공개 계약은 유지하되 관련 Profile 후보 query는 field-level login scope 뒤에서만 실행한다.
- [additive field를 먼저 배포하면 아직 client 소비자가 없다] → PROD-528을 독립 배포 가능한 API slice로 유지하고 PROD-529가 schema를 소비한 뒤 전체 탐색을 활성화한다.

## Migration Plan

데이터 migration과 backfill은 없다. additive GraphQL field와 schema snapshot, 통합 테스트를 함께 배포한다. PROD-529 client는 이 field가 배포된 뒤 연결한다. 롤백은 client가 아직 의존하지 않는 동안 field와 schema 항목을 제거하는 방식이며, 이미 배포된 client가 의존하기 시작한 뒤에는 부모 PROD-525의 호환성·rollout 판단 없이 제거하지 않는다.

## Open Questions

없음.
