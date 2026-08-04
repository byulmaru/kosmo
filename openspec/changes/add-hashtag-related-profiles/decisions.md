## Context

이 기록은 PROD-523·524에서 승인된 정확한 Hashtag identity 기반 관련 Profile 탐색 계약을 PROD-525 공유 change의 첫 구현 slice인 PROD-528 GraphQL API로 구체화한다. 최신 canonical과 Linear 계약은 사람 검색의 `#` 모드와 TagChip 관계 탐색을 분리하며, PROD-526이 제공한 Hashtag/Profile Tag 저장 기반 위에서 인증·visibility·pagination 경계를 공유해야 한다.

## Decision Records

### Hashtag 관계 목록은 사람 검색과 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-524`, `PROD-525`, `PROD-528`
- Status: Active
- Context / Problem: PROD-524의 초기 승인 이력에는 사람 검색의 `#` 모드와 TagChip 탐색을 같은 상태로 결합하는 폐기된 표현이 남아 있지만, 최신 canonical과 Linear 본문은 결과 타입과 책임이 다른 두 흐름을 분리한다.
- Decision Outcome: 관련 Profile 목록은 이미 확인된 정확한 Hashtag identity에서 시작하는 별도 관계 조회다. Hashtag 이름·`#` 접두사·부분 일치를 해석하지 않고, Hashtag 또는 Hashtag Name 결과를 반환하지 않으며 기존 `searchProfiles`를 변경하지 않는다.
- Alternatives Considered: `searchProfiles`에 Hashtag 모드를 추가하거나 Hashtag 이름 문자열을 별도 root query에 전달하면 기존 handle 검색과 exact identity 관계 조회의 결과·인증·pagination 계약이 섞이므로 선택하지 않았다.
- Consequences: API와 client는 Hashtag global identity를 전달해야 하며, 검색창 Hashtag 검색이 필요하면 별도 Domain/Issue/OpenSpec 계약을 거쳐야 한다.
- Confirmation / Follow-up: schema와 integration test에서 `searchProfiles` shape·동작이 유지되고 새 field가 parent Hashtag identity만 사용하는지 확인한다.

### 관련 Profile 후보는 로그인 뒤 공용 visibility로 제한한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-523`, `PROD-524`, `PROD-525`, `PROD-528`
- Status: Active
- Context / Problem: Profile Tag 관계만 확인하거나 page limit 뒤 visibility를 적용하면 비공개·정지 Profile이 노출되거나 page가 짧아질 수 있다. `usingProfile` 인증은 selected Profile 없는 로그인 Account를 불필요하게 거부한다.
- Decision Outcome: GraphQL field가 Account `login`을 resolver와 Profile 후보 query 전에 평가한다. 후보 SQL은 exact Hashtag 관계와 Active·Normal Profile visibility를 page limit 전에 함께 적용하고, 저장된 Profile Origin을 별도로 제한하지 않으며 Remote lookup·refresh·materialization을 수행하지 않는다.
- Alternatives Considered: `usingProfile` scope는 canonical보다 강한 권한을 요구한다. resolver 내부 수동 인증은 field scope의 선행 실행과 기존 permission error 계약을 잃는다. application filtering은 짧은 page와 cursor 누락을 만들 수 있다.
- Consequences: selected Profile이 없는 Active Account도 조회할 수 있고, 비인증 요청은 기존 `PERMISSION_DENIED` 표현을 사용한다. 이미 저장된 Local·Remote 관계는 공용 visibility를 통과할 때 같은 목록 계약으로 반환한다.
- Confirmation / Follow-up: 인증 실패에서 후보 SQL이 실행되지 않는지, selected Profile 없는 Session 성공, 비공개·suspended 제외와 원격 lookup 미수행, filter-before-limit page fullness를 integration test로 확인한다.

### Hashtag Node에 ProfileConnection 관계 field를 둔다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-525` (2026-07-30 Issue Gate 승인 snapshot), `PROD-528`
- Status: Active
- Context / Problem: canonical은 정확한 Hashtag identity와 Profile 목록 결과를 요구하지만 GraphQL root/object field와 input shape는 구현 이슈에 맡겼다. API는 normalized cache의 Hashtag identity를 보존하면서 별도 문자열 검색 표면을 만들지 않아야 한다.
- Decision Outcome: 기존 `Hashtag` Node에 `relatedProfiles(first:, after:): ProfileConnection!` object field를 추가하고 기존 `Profile` node와 `ProfileConnection` type을 재사용한다. parent Hashtag가 존재하지 않는 경우는 기존 Node lookup의 `null` 계약을 유지하고, 존재하지만 관련 후보가 없는 경우는 빈 connection을 반환한다.
- Alternatives Considered: `relatedProfiles(hashtagId:)` root field는 Hashtag identity를 다시 argument로 전달하고 object 관계를 중복한다. canonical name 문자열 input은 exact row identity 대신 이름 해석 API를 새로 만든다. 별도 edge/node type은 공개할 관계 metadata가 없어 불필요하다.
- Consequences: Profile Tag/route가 보유한 Hashtag global ID로 Node를 조회한 뒤 같은 normalized entity에서 connection을 확장할 수 있다. PROD-529는 이 field와 identity 전달 방식을 client query에 맞춰야 한다.
- Confirmation / Follow-up: 생성 schema가 승인된 field와 공용 `ProfileConnection`을 노출하고 Hashtag 이름 argument나 신규 결과 type을 만들지 않는지 검증한다.

### Profile ID 오름차순 cursor와 field별 20개 상한을 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-525` (2026-07-30 Issue Gate 승인 snapshot), `PROD-528`
- Status: Active
- Context / Problem: canonical은 stable immutable Profile cursor와 최대 20개를 요구하지만 구체 ordering key와 방향을 정하지 않았다. Profile Tag 관계는 무순서·무상한이므로 relation row 순서나 생성 시각을 제품 순서로 사용할 수 없다.
- Decision Outcome: forward connection은 immutable하고 unique한 `Profile.id ASC`를 ordering key와 opaque cursor payload로 사용한다. field는 `first`·`after`를 소유하고 page 크기를 생략해도 기본 20개, 20보다 크게 요청해도 최대 20개로 제한한다.
- Alternatives Considered: relation ID·`createdAt`은 관계 저장 순서를 제품 순서로 승격한다. 알파벳·관련도 정렬은 canonical 제외 범위다. `Profile.createdAt`과 ID 복합 cursor는 시간순 의미가 없고 필요 이상의 공개 의미를 추가한다. 전역 connection max 변경은 다른 API에 영향을 준다.
- Consequences: 같은 millisecond의 UUIDv7이 생성 순서를 표현하지 않아도 시간순 의미 없이 결정적인 전체 순서를 제공한다. 변경되지 않은 결과 집합에서 page 사이 중복·누락을 방지하며 snapshot pagination은 제공하지 않는다.
- Confirmation / Follow-up: default page, oversized `first`, 두 page `after` 이동, 관계 row 순서와 다른 Profile ID 순서, 중복·누락 없는 결과를 integration test로 검증한다.

### 공유 change에서 구현 이슈별 task ownership을 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-525`, `PROD-528`, `PROD-529`
- Status: Active
- Context / Problem: PROD-525는 API와 client navigation을 함께 검증하고 OpenSpec을 archive하지만, 각 구현 이슈는 독립 branch·PR·검증 책임을 가진다.
- Decision Outcome: 이번 PROD-528 branch의 tasks는 API resolver·schema·integration verification만 소유한다. PROD-529 client route·TagChip navigation·Relay 상태·UI/E2E task와 PROD-525 최종 통합·archive task는 이 branch에 섞지 않고 같은 change의 후속 slice로 추가한다.
- Alternatives Considered: PROD-529 task를 미리 작성하면 아직 해당 구현 이슈가 검토하지 않은 route/client 선택을 PROD-528이 고정한다. 별도 API OpenSpec을 만들면 하나의 탐색 계약과 archive 책임이 중복된다.
- Consequences: PROD-528 task가 모두 끝나도 shared change 전체 완료나 archive를 의미하지 않는다. PROD-525는 후속 task와 최종 통합 결과까지 확인한 뒤에만 archive한다.
- Confirmation / Follow-up: tasks heading과 PR scope가 PROD-528만 식별하고, handoff가 `NEXT_PHASE: implement`로 API slice만 전달하는지 확인한다.

### Hashtag global ID route와 관계 목록 제목을 사용한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-525`, `PROD-529` (2026-08-05 route 선택과 제목 승인)
- Status: Active
- Context / Problem: canonical은 TagChip이 정확한 Hashtag identity를 전달하고 관계 목록임을 URL·UI·접근성에서 구분하도록 요구하지만, route path와 화면 제목은 구현 이슈에 맡겼다. 이름 기반 path는 별도 name-to-identity 조회와 이름 변경 시 URL 안정성 결정을 추가한다.
- Decision Outcome: client는 `/hashtags/[hashtagId]/profiles` path에서 Hashtag global ID를 `node(id:)`로 조회한다. canonical Hashtag 이름은 identity로 사용하지 않고 화면 제목 `#<태그명> 관련 프로필`에만 사용한다. 첫 응답 전에는 `관련 프로필` 제목을 유지하고 성공한 Node 응답 뒤 전체 제목으로 갱신한다.
- Alternatives Considered: `/hashtags/[normalizedName]/profiles`는 읽기 쉽지만 exact row identity를 이름 해석 계약으로 바꾸고 이름 변경 시 URL 안정성을 새로 결정해야 한다. 검색 URL이나 query-only route는 사람 검색과 관계 목록의 의미를 다시 결합한다.
- Consequences: URL은 사람이 읽기 어렵지만 exact identity와 이름 변경 안정성을 보존한다. 직접 route 진입과 TagChip 진입은 같은 Node query를 사용하며 stale 이름 parameter가 identity를 바꾸지 않는다.
- Confirmation / Follow-up: TagChip link와 직접 진입이 같은 Hashtag ID를 query하고, URL·PageHeader·접근성 이름이 검색이 아닌 관계 목록임을 Web test에서 검증한다.

### Hashtag 관계 목록은 전용 Relay 상태에서 기존 Profile item을 재사용한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`, `PROD-525`, `PROD-529`
- Status: Active
- Context / Problem: 기존 search, followers와 following에는 각자의 Profile connection과 pagination UI가 있지만 query owner와 상태 계약이 다르다. 이를 직접 재사용하거나 한 connection key에 결합하면 filter와 retry 상태가 충돌할 수 있다.
- Decision Outcome: PROD-529는 `Hashtag.relatedProfiles` 전용 Relay connection을 소유하고 기존 Profile 목록 item·Profile 이동·follow action과 공용 pagination UX를 재사용한다. 공개 Profile TagChip visual component는 유지하며 진입점의 `Link`·`Pressable` wrapper가 exact ID navigation과 접근성 target을 소유한다.
- Alternatives Considered: followers/following fragment를 범용화하면 승인 범위 밖의 route와 query owner를 함께 변경한다. search mode 추가는 기존 `searchProfiles`와의 분리 계약을 위반한다. TagChip 자체에 표시·편집·navigation variant를 모두 넣으면 component 책임이 다시 결합된다.
- Consequences: Hashtag list에 작은 전용 query/fragment가 추가되지만 기존 검색·팔로워 목록의 cache와 pagination 상태는 바뀌지 않는다. 다음 page 실패는 기존 edge를 유지하고 실패한 요청만 재시도한다.
- Confirmation / Follow-up: connection key 격리, 첫/다음 page error, retry, empty, terminal, 중복 요청 방지와 기존 검색 회귀를 unit·상태 catalog·Web E2E에서 확인한다.

### Web 검증과 Native runtime 출시 gate를 분리한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`, `PROD-525`, `PROD-529`
- Status: Active
- Context / Problem: 공용 React Native component와 platform target mapping은 Web 자동화와 source inspection으로 확인할 수 있지만 실제 iOS·Android focus·touch·screen reader 동작까지 증명하지 않는다.
- Decision Outcome: PROD-529는 App unit·상태 catalog·Relay·Web E2E와 platform target source mapping을 구현 완료 증거로 소유한다. iOS·Android 실제 runtime QA는 Native 출시 gate로 남기며 Web 결과를 Native 완료로 표현하지 않는다.
- Alternatives Considered: Web 자동화를 세 플랫폼 완료로 간주하면 검증 범위를 과장한다. 반대로 Native runtime QA를 PROD-529 PR readiness의 필수 gate로 두면 현재 Web 중심 출시 범위를 불필요하게 막는다.
- Consequences: 공용 정보 구조와 target mapping은 유지하되 Native 실제 환경의 focus·target 비중첩·screen reader 검증은 후속 책임으로 명시된다.
- Confirmation / Follow-up: PROD-529 handoff와 PR 본문이 Web proof, Native source mapping과 남은 Native runtime QA를 구분하고 PROD-525가 최종 통합·archive 책임을 유지하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음. PROD-524의 폐기된 사람 검색 `#` 모드 결정은 canonical ADR 0021과 최신 Linear 본문에서 이미 대체됐으며, 이 change에서 새 decision으로 계승하지 않는다.
