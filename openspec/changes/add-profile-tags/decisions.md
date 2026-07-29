## Context

이 기록은 `PROD-523`에서 승인해 canonical 문서에 반영한 Profile Tag 제품 계약과, 이를 저장·GraphQL·Web·Android·iOS로 전달하는 `PROD-522`, `PROD-526`, `PROD-527`의 구현 경계를 반영한다. 제품 행동은 canonical·Linear authority에서 파생하고, 여러 구현 slice가 호환성을 위해 공유해야 하는 저장·API·transaction 선택만 Implementation Choice로 고정한다.

## Decision Records

### Profile Tag는 canonical Hashtag identity를 공유하는 순서 관계다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: Profile 관심사를 bio 문자열, 별도 ProfileTag identity 또는 Post와 Profile이 공유할 canonical Hashtag identity 관계 중 무엇으로 표현할지 정해져야 저장·검색의 이름 identity가 갈라지지 않는다.
- Decision Outcome: Profile Tag는 Post와 Profile이 공유하는 canonical Hashtag identity를 Profile이 0~5개까지 참조하는 순서 있는 구조화 관계다. bio에서 추출·동기화하지 않으며 정규화된 Hashtag Name을 identity 의미로 공유한다.
- Alternatives Considered: bio 파생은 Owner가 명시적으로 편집한 목록·순서를 보존할 수 없어 제외했다. 별도 ProfileTag identity는 같은 이름의 Post Hashtag와 정규화·검색 identity를 분리하므로 제외했다.
- Consequences: Post와 Profile의 관계 생성 방식은 독립적으로 유지되지만 canonical Hashtag identity를 나타내는 저장 row를 공유할 수 있어야 한다. Profile Tag 검색 행동은 이 관계 존재만으로 활성화되지 않는다.
- Confirmation / Follow-up: 저장 구조가 추가된 뒤 같은 normalized name이 하나의 canonical identity row로 수렴하는지, bio 비파생과 관계 순서를 DB·service test에서 확인한다.

### canonical Hashtag identity와 Profile 관계를 additive tables로 저장한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: 현재 DB에는 Hashtag 구현이 없고, `PROD-526`이 canonical Hashtag identity의 normalized 이름 재사용·관계 순서·중복·Profile 생명주기를 저장해야 한다.
- Decision Outcome: 고유한 normalized `name`과 UUID identity를 가진 `hashtag` table, `profile_id`·`hashtag_id`·0~4 `position`을 가진 `profile_hashtag` relation table을 additive하게 추가한다. `(profile_id, hashtag_id)`와 `(profile_id, position)`을 각각 유일하게 하고 Profile 삭제는 relation만 cascade한다. 관계가 없어져도 Hashtag row를 자동 삭제하지 않으며 기존 bio·Post data를 backfill하지 않는다.
- Alternatives Considered: Profile row의 JSON/string array는 canonical Hashtag identity와 관계 유일성을 잃으므로 제외했다. 이름을 중복 저장하는 별도 `profile_tag` table은 Post와 공유 identity라는 canonical 계약에 맞지 않는다. 기존 bio backfill은 명시적 Owner 선택이 아니므로 제외했다.
- Consequences: migration은 새 table과 제약만 추가하고 기존 binary가 이를 무시할 수 있다. 미래 Post Hashtag 구현은 같은 `hashtag` identity를 재사용할 수 있지만 Post relation과 검색 index는 이번 change에 포함되지 않는다.
- Confirmation / Follow-up: fresh migration, production-equivalent upgrade, unique/check/foreign-key, 비활성 관계 보존과 Profile delete cascade를 migration·DB test로 검증한다.

### 하나의 server normalizer가 Hashtag identity를 결정한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-527`
- Status: Active
- Context / Problem: JavaScript와 PostgreSQL의 단순 lowercase 또는 client별 구현에 identity 생성을 맡기면 locale·Unicode 처리와 길이 계산이 달라질 수 있다.
- Decision Outcome: server core의 단일 normalizer가 trim, 선택적 ASCII 앞 `#` 제거, NFKC, locale 비종속 Unicode full case folding을 적용하고 최종 결과를 Unicode code point 단위로 센다. 1~20개의 `Letter | Number | _`만 허용하고 이 결과만 Hashtag `name`으로 저장한다. client는 빠른 feedback을 위해 같은 규칙을 미러링할 수 있지만 server 결과가 권위다. Unicode data 제공 방식은 검증된 dependency와 repository-generated table 중 specs를 만족하는 구현을 허용한다.
- Alternatives Considered: `toLocaleLowerCase()`와 DB `lower()`는 locale·Unicode full folding 계약을 보장하지 않아 제외했다. client-only normalization은 우회 가능하고 플랫폼별 결과가 갈릴 수 있어 제외했다. raw name을 identity로 함께 보존하는 방식은 현재 canonical display 계약에 필요하지 않아 제외했다.
- Consequences: implementation은 사용하는 Unicode version을 고정하고 normalization vector를 유지해야 한다. case folding 뒤 길이·허용 문자가 달라지는 입력도 최종 normalized 결과로 검증된다.
- Confirmation / Follow-up: 공백·`#`, compatibility 문자, 대소문자, composed/decomposed 입력, folding 확장, astral code point, 길이 경계와 duplicate vector를 core·API·client parity test로 확인한다.

### GraphQL Profile은 normalized string list로 Tags를 교환한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/design/profile-tags.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-527`
- Status: Active
- Context / Problem: backend와 universal client가 현재 필요한 identity·순서·빈 상태를 호환 가능한 GraphQL shape로 공유해야 하지만 Hashtag 전용 조회·navigation은 제외되어 있다.
- Decision Outcome: `Profile.tags: [String!]!`는 `#` 없는 normalized Hashtag Name을 저장 순서로 반환한다. 관계가 없는 Local Profile과 현재 범위의 Remote Profile은 빈 목록을 반환한다. 기존 `UpdateProfileInput`의 선택적 `tags: [String!]`에 배열이 오면 전체 replacement, 빈 배열이면 전체 제거, 생략 또는 `null`이면 기존 목록 보존으로 처리한다. `UpdateProfilePayload.profile`에서 최신 tags를 선택할 수 있게 한다.
- Alternatives Considered: Hashtag object/Node/connection은 독립 조회·pagination이 필요 없는 현재 범위에 과하다. nullable output은 빈 목록과 미지원 상태를 불필요하게 분리한다. 별도 Profile Tag mutation은 다른 Profile 표현 값과 같은 저장 action이라는 계약을 깨뜨린다. chip용 `#`를 API 값에 포함하면 identity와 presentation이 결합되어 제외했다.
- Consequences: 새 output field와 optional input은 기존 client와 호환된다. 이후 검색 navigation에 별도 Hashtag identity field가 필요하면 검색 change가 GraphQL 계약을 확장해야 하며, 이번 field의 normalized string 의미를 바꾸지 않는다.
- Confirmation / Follow-up: schema snapshot과 GraphQL integration에서 omitted·null·empty·nonempty input, Local/Remote output과 mutation payload cache 동기화를 검증한다.

### Profile 값과 Tag 관계를 직렬화된 한 transaction으로 교체한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: 기존 update resolver에 relation delete/insert를 별도로 추가하면 validation 또는 저장 실패 때 scalar Profile 값만 반영되거나 동시 요청의 순서가 섞일 수 있다.
- Decision Outcome: 권한·Local·visibility 조건을 재확인하고 대상 Profile update를 직렬화하는 하나의 DB transaction에서 scalar 값, Hashtag upsert와 전체 relation replacement를 처리한다. 동시 요청은 Profile 단위로 직렬화하며 마지막으로 성공한 transaction의 전체 값과 Tag 순서가 남는다. row lock 또는 동등하게 검증된 직렬화 수단을 사용할 수 있다.
- Alternatives Considered: scalar update 뒤 별도 relation transaction은 부분 commit 위험 때문에 제외했다. 별도 Tag mutation은 같은 저장 action 계약과 draft 복구를 복잡하게 한다. optimistic version field 추가는 현재 Profile 공개 계약을 확장하므로 채택하지 않았다.
- Consequences: GraphQL resolver의 직접 row update 일부를 transaction/service 경계로 이동해야 한다. validation·권한·upsert·relation 실패는 모두 요청 전 상태를 보존해야 한다.
- Confirmation / Follow-up: scalar와 tags 동시 성공, 각 실패 rollback, concurrent replacement와 Hashtag upsert 경합을 database integration test로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
