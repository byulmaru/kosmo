## Context

이 결정 기록은 PROD-504와 Profile canonical 조회·검색 정책을 부분일치 GraphQL connection과 사람 탭 목록으로 구체화한다. 기존 exact lookup 소비자 호환성, SQL `LIKE` 입력 안전성, 첫 공개부터 적용할 cursor pagination 경계를 구현 전에 고정한다.

## Decision Records

### 현재 단계는 일치 결과 전체를 반환한다 (Superseded)

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-504`
- Status: Superseded by `검색은 첫 공개부터 cursor connection을 사용한다` (2026-07-28)
- Context / Problem: 부분일치 다건 결과에 결과 상한, pagination 또는 별도 정렬을 지금 도입할지 결정해야 했다.
- Decision Outcome: 현재 단계에서는 조회 정책을 통과한 부분일치 결과 전체를 반환한다. 최대 결과 개수, pagination, 별도 정렬 의미를 추가하지 않는다.
- Alternatives Considered: 고정 상한을 둔 목록은 일부 결과를 조용히 누락하며, Relay cursor connection은 사용자가 현재 범위에서 제외한 pagination 계약과 구현 폭을 추가하므로 선택하지 않았다.
- Consequences: 결과가 많으면 API 응답과 UI 렌더 비용이 커질 수 있고 DB 반환 순서는 보장되지 않는다. 실제 규모와 query plan 근거가 생기면 후속 Linear/OpenSpec 변경으로 상한·정렬·pagination을 함께 결정한다.
- Confirmation / Follow-up: API 통합 및 검색 E2E에서 복수 결과가 누락 없이 표시되고 테스트가 특정 반환 순서에 의존하지 않는지 확인한다.

### 검색은 첫 공개부터 cursor connection을 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-504`, PR #376 review by `robin-maki`
- Status: Active
- Context / Problem: `[Profile!]!`을 먼저 공개한 뒤 pagination을 추가하면 반환형을 바꾸는 breaking change가 생기고, 무상한 `%query%` 조회는 Profile 증가에 따라 DB·payload·render 비용이 함께 커진다.
- Decision Outcome: `searchProfiles(query: String!, first: Int, after: String): ProfileConnection!`으로 시작한다. 현재 검색 대상은 handle 부분 일치로 유지하며, 단일 Instance 범위에서 유일한 `normalizedHandle ASC`를 cursor 순서로 사용한다. API와 Relay client는 페이지 사이 중복·누락 없이 결과를 누적한다.
- Alternatives Considered: `[Profile!]!` 전체 반환은 후속 pagination의 breaking change와 무상한 비용을 만든다. 별도 paginated field를 나중에 추가하면 같은 검색 의미의 공개 API가 중복된다.
- Consequences: API·schema·Relay fragment·Story/E2E 범위가 커지지만 첫 공개 계약이 장기 확장성과 비용 경계를 가진다. 검색 index와 관련도 정렬은 여전히 별도 근거가 필요한 후속 범위다.
- Confirmation / Follow-up: API 통합 테스트로 `first`/`after`, `normalizedHandle ASC`, 페이지 중복·누락 및 종료를 검증하고, client Story/E2E로 다음 페이지 loading/error/retry와 기존 edge 유지를 검증한다.

### exact lookup과 별도의 다건 GraphQL field를 사용한다 (Superseded)

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-504`
- Status: Superseded by `검색 동작을 나타내는 connection field를 사용한다` (2026-07-28)
- Context / Problem: 기존 `profileByHandle(handle:)`은 프로필 route와 follow 화면이 nullable 단건 exact lookup으로 사용하지만 사람 탭은 다건 결과가 필요하다.
- Decision Outcome: 기존 `profileByHandle(handle: String!): Profile` 계약을 유지하고 사람 검색에 `profilesByHandle(handle: String!): [Profile!]!` 다건 field를 추가한다. API와 SearchScreen Relay query는 같은 변경에서 동기화한다.
- Alternatives Considered: 기존 field 반환형을 list로 바꾸는 방식은 기존 route·테스트·캐시 소비자를 깨뜨리는 breaking change라 제외했다. connection field는 현재 pagination 제외 결정과 맞지 않아 사용하지 않는다.
- Consequences: exact와 partial 두 query가 존재하므로 이름과 의미를 구분해야 하지만 기존 소비자는 변경 없이 유지된다. 후속 pagination은 새 field의 호환 전략을 별도로 검토해야 한다.
- Confirmation / Follow-up: schema diff와 repository 검색으로 기존 exact 소비자가 유지되고 사람 탭만 다건 field를 사용하는지 확인한다.

### 검색 동작을 나타내는 connection field를 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-504`, PR #376 review by `robin-maki`
- Status: Active
- Context / Problem: `profilesByHandle`은 현재 구현 기준을 이름에 노출하고 `[Profile!]!` 반환형은 장기 pagination 계약으로 확장할 수 없다.
- Decision Outcome: 기존 `profileByHandle(handle: String!): Profile`은 유지하고 사람 검색에는 `searchProfiles(query: String!, first: Int, after: String): ProfileConnection!`을 사용한다. API와 SearchScreen Relay connection fragment를 같은 변경에서 동기화한다.
- Alternatives Considered: 기존 exact field 반환형 변경은 기존 route 소비자를 깨뜨린다. `profilesByHandle` list field 유지는 후속 pagination용 중복 field 또는 breaking change를 요구한다.
- Consequences: 이름은 이후 handle 외 검색 기준을 추가할 수 있는 검색 entry point를 나타내되, PROD-504의 실제 검색 대상은 계속 handle 부분 일치로 제한된다.
- Confirmation / Follow-up: schema diff와 repository 검색으로 기존 exact 소비자가 유지되고 사람 탭만 `searchProfiles` connection을 사용하는지 확인한다.

### 사용자 LIKE 메타문자를 먼저 escape하고 검색 wildcard를 나중에 추가한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-504`
- Status: Active
- Context / Problem: 사용자 입력의 `%`, `_`와 escape 문자를 그대로 `LIKE` pattern에 넣으면 SQL injection이 아니더라도 의도하지 않은 wildcard 검색을 만들 수 있다.
- Decision Outcome: 정규화된 사용자 입력의 escape 문자, `%`, `_`를 SQL `LIKE` 리터럴로 먼저 escape한 다음 부분일치용 `%`를 양쪽에 추가한다. 완성된 pattern은 parameter binding으로 전달하고 escape 의미를 SQL predicate에 유지한다.
- Alternatives Considered: 입력을 그대로 pattern에 넣는 방식은 wildcard 의미 주입을 허용한다. 문자열 보간은 SQL injection 경계를 깨뜨린다. 전체 pattern을 마지막에 escape하면 시스템이 추가한 부분일치 wildcard까지 리터럴이 되므로 제외했다.
- Consequences: literal `%` 또는 `_` 검색은 해당 문자를 실제 handle에 포함한 결과만 찾고, 없으면 빈 결과를 반환한다. escape 순서와 DB predicate가 서로 맞아야 한다.
- Confirmation / Follow-up: API 통합 테스트에서 `%`, `_`, escape 문자가 전체 또는 패턴 검색으로 확장되지 않고 parameterized query가 유지되는지 검증한다.

### 기존 handle 해석 경계와 ADR0017 staged visibility를 유지한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0017-profile-search-staged-visibility.md` (현재 staged visibility), `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md` (최종 moderation 정책), `PROD-504`
- Status: Active
- Context / Problem: 부분일치를 모든 instance를 가로지르는 새 검색 의미로 넓히거나 기존 exact 조회와 다른 노출 조건을 적용하면 local/remote 해석 및 결과 범위가 달라질 수 있다.
- Decision Outcome: bare/local-domain 입력은 configured local Instance, remote-domain 입력은 해당 ActivityPub Instance에 이미 저장된 Profile에서만 부분 일치한다. [ADR 0017](../../../docs/domain/decisions/0017-profile-search-staged-visibility.md)의 staged visibility를 exact·partial에 함께 적용해 configured local Instance의 `ProfileState.ACTIVE` Profile과 remote branch의 `ProfileState.ACTIVE` Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance의 Profile을 포함한다. 검색 중 WebFinger, actor document fetch·refresh 또는 신규 Remote Profile materialization을 수행하지 않는다. Domain Limit Instance와 viewer Profile Domain Block은 최종 canonical moderation 정책이며, 저장 모델과 공통 predicate가 도입되면 exact·partial lookup을 함께 전환한다. 이 staged choice는 ADR0017에서 파생한 계약이며 ADR0004가 현재 omission을 직접 승인하는 근거가 아니다.
- Alternatives Considered: bare 검색을 모든 instance에 적용하는 방식은 현재 handle 해석 경계를 바꾸며 PROD-504가 승인하지 않은 전역 검색 의미를 추가한다. 검색 중 remote lookup·refresh·materialization을 수행하는 방식은 저장된 대상만 검색한다는 계약을 깨뜨린다. Domain Limit·Profile Domain Block을 이 변경에서 새로 구현하거나 임의의 visibility 조건으로 대체하는 방식은 최종 정책의 저장 모델과 공통 predicate를 선행시키므로 후속 moderation rollout으로 남긴다.
- Consequences: remote 부분 검색에는 domain 입력이 필요하며, exact와 partial은 현재 단계에서 동일한 staged visibility를 사용한다. 최종 Domain Limit·viewer Profile Domain Block 적용은 별도 공통 predicate 도입 이후 exact·partial 동시 전환으로 이루어지며, 그 전까지 이 변경은 해당 모델을 전제로 하지 않는다.
- Confirmation / Follow-up: local/remote handle resolution, configured local `ProfileState.ACTIVE`, remote `ProfileState.ACTIVE` 및 non-suspended Instance 조건, no-materialization 통합 시나리오를 확인한다. 공통 moderation predicate가 도입되는 후속 rollout에서 exact·partial 전환과 ADR0017 supersede를 검증한다.

## Remaining Decisions

- 없음. 관련도 정렬과 검색 index는 명시적으로 제외된 후속 범위다.

## Superseded Decisions

- 2026-07-27 `현재 단계는 일치 결과 전체를 반환한다`는 2026-07-28 PR #376 리뷰 결정으로 대체됐다.
- 2026-07-27 `exact lookup과 별도의 다건 GraphQL field를 사용한다`는 2026-07-28 `searchProfiles` connection 결정으로 대체됐다.
