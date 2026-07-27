## Context

사람 탭은 현재 `profileByHandle(handle:)`로 exact 단건 조회를 실행하고 단일 `ProfileListItem`을 렌더링한다. 같은 field는 프로필 route와 follow 화면 등 여러 소비자가 exact lookup으로 사용하므로 반환형을 목록으로 바꾸면 기존 공개 계약이 깨진다. Profile은 instance별 `normalizedHandle`을 저장하며, 부분 일치 검색은 기존 bare/local-domain/remote-domain 해석과 canonical Profile 검색 노출 정책을 유지해야 한다. 현재 lookup 가시성은 [ADR 0017](../../../docs/domain/decisions/0017-profile-search-staged-visibility.md)의 staged 계약을 따른다.

PROD-504는 첫 공개부터 cursor pagination 가능한 검색 계약을 선택했다. DB schema·index·migration과 관련도 정렬은 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- 기존 exact lookup을 유지하는 부분일치 GraphQL connection을 제공한다.
- 사용자 입력의 SQL `LIKE` 메타문자를 리터럴로 처리하고 parameter binding을 유지한다.
- 사람 탭에서 Relay pagination 결과를 기존 `ProfileListItem`/`FollowButton` 계약으로 렌더링한다.
- local/remote 저장 Profile의 조회·검색 노출 정책과 remote no-materialization 경계를 지킨다. Staged visibility는 exact·partial에 동일하게 적용한다.

**Non-Goals:**

- 관련도 정렬
- display name, 게시글, 미디어 검색
- 검색용 DB index 또는 schema migration
- remote actor discovery·refresh·저장
- 기존 exact `profileByHandle`의 별도 정책 갭을 전면 수정하는 작업

## Implementation Guidance

### Current Constraints

- `profileByHandle`은 프로필 route와 follow 화면·테스트가 단건 nullable `Profile` 계약에 의존하므로 변경할 수 없다.
- 기존 resolver는 parsed handle의 kind에 따라 configured local instance 또는 지정 remote domain으로 조회 범위를 나눈다. 부분 검색도 이 경계를 유지해야 한다.
- 선행 `%`가 있는 `LIKE`는 현재 `(instanceId, normalizedHandle)` unique index의 exact lookup 이점을 그대로 사용하지 못하며, 이번 범위에는 검색 index가 없다.
- [ADR 0017](../../../docs/domain/decisions/0017-profile-search-staged-visibility.md)의 현재 staged visibility는 exact·partial lookup에 함께 적용한다. configured local Instance에서는 `ProfileState.ACTIVE` Profile만 포함하고, remote branch에서는 해당 ActivityPub Instance에 저장된 `ProfileState.ACTIVE` Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance의 Profile만 포함한다. Domain Limit Instance와 viewer Profile Domain Block은 최종 canonical moderation 정책이며, 이를 적용할 저장 모델과 공통 predicate를 도입하는 후속 rollout이 필요하지만 PROD-504의 선행 조건은 아니다. 새 검색 query는 이 staged 조건과 기존 handle 해석 경계를 유지하고, 검색 중 remote lookup·refresh·신규 Profile materialization을 수행하지 않는다.
- SearchScreen의 Relay query와 Story mock은 connection/edge/pageInfo shape과 다음 페이지 상태에 맞춰 함께 변경해야 한다.

### Recommended Approach

- exact field는 유지하고 `searchProfiles(query: String!, first: Int, after: String): ProfileConnection!` 형태의 별도 connection query를 추가한다. 반환 Profile row는 기존 loadable Node/fragment 경계를 그대로 사용한다.
- leading `@`, 대소문자, optional domain은 기존 handle 정책과 같은 방식으로 정규화하되, handle 일부 자체를 full handle 유효성으로 오인해 불필요하게 거부하지 않는다. bare/local-domain 검색은 configured local instance, remote-domain 검색은 해당 ActivityPub instance로 제한한다.
- 정규화된 사용자 검색어에서 escape 문자, `%`, `_` 순으로 `LIKE` 메타문자를 escape한 뒤에만 양쪽에 `%`를 붙인다. 완성된 pattern은 Drizzle parameter로 전달하고 SQL에는 명시적인 escape 의미가 유지되게 한다. 빈 정규화 검색어는 전체 테이블 검색으로 바꾸지 않는다.
- Pothos `resolveCursorConnection`을 사용하고 `normalizedHandle`을 cursor로 encode한다. `after`는 `normalizedHandle > cursor`, 역방향 요청은 반대 predicate/order를 사용하며 최종 결과 의미는 항상 ascending이다.
- 사람 탭의 colocated Relay query는 refetchable connection fragment를 spread하고 `usePaginationFragment`로 읽는다. route state에서 edge를 직접 합치지 않고 Relay가 누적을 소유한다. 빈 connection은 기존 empty 상태, 초기 request 실패는 기존 RouteBoundary, 다음 페이지 실패는 기존 edge를 유지한 inline retry 상태로 표시한다.
- API 통합 테스트는 local/remote 부분일치, cursor pagination 중복·누락 방지, 복수/empty, 정규화, `%`·`_`·escape 문자, 노출 정책, no-materialization을 검증한다. 검색 Story/E2E는 다건 렌더링·다음 페이지 loading/error/retry·empty·wildcard 입력과 기존 링크/follow 표시 계약을 검증한다.

### Allowed Alternatives

- `LIKE` predicate를 Drizzle helper 또는 parameterized SQL fragment로 구성할 수 있다. 어느 쪽이든 입력 escape 순서, 명시적 escape 의미와 parameter binding을 보존해야 한다.
- 내부 입력 정규화·pattern 생성 로직의 파일 위치는 기존 모듈 경계와 테스트 가능성을 지키는 범위에서 선택할 수 있다.

## Risks / Trade-offs

- [일치 결과가 많으면 응답 크기와 UI 렌더 비용이 증가한다] → 첫 공개부터 `first`/`after` connection으로 페이지 비용을 제한한다.
- [선행 wildcard 조회가 커지면 DB full scan 비용이 증가한다] → 이번 변경은 migration을 만들지 않고 현재 데이터 규모에서 검증하며, 검색 index는 query plan 근거가 생긴 후 별도 변경으로 다룬다.
- [부분 검색용 visibility 조건이 exact resolver와 달라질 수 있다] → [ADR 0017](../../../docs/domain/decisions/0017-profile-search-staged-visibility.md)의 staged 조건을 exact·partial 양쪽에 동일하게 적용하고, Domain Limit·viewer Profile Domain Block의 공통 predicate 전환은 후속 rollout에서 함께 수행한다. 이 변경은 그 모델을 전제로 하지 않는다.
- [cursor 순서가 안정적이지 않으면 페이지가 중복·누락될 수 있다] → 단일 Instance 범위의 unique key인 `normalizedHandle ASC`를 cursor와 order에 함께 사용하고 통합 테스트로 페이지 경계를 검증한다.

## Migration Plan

1. 기존 exact field를 유지한 채 connection query와 통합 테스트를 추가한다.
2. GraphQL schema/Relay artifact를 갱신하고 사람 탭·Story/E2E를 connection shape와 pagination 상태로 전환한다.
3. API와 클라이언트를 함께 배포한다. DB migration과 backfill은 없다.
4. 롤백 시 사람 탭을 기존 exact query로 되돌리고 새 다건 field를 제거한다. 저장 데이터 변화는 없다.

## Open Questions

없음. 관련도 정렬과 검색 index는 명시적 후속 범위다.
