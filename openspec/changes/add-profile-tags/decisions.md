## Context

이 기록은 `PROD-523`에서 승인해 canonical 문서에 반영한 Profile Tag 제품 계약과, 이를 저장·GraphQL·Web·Android·iOS로 전달하는 `PROD-522`, `PROD-526`, `PROD-527`의 구현 경계를 반영한다. 제품 행동은 canonical·Linear authority에서 파생하고, 여러 구현 slice가 호환성을 위해 공유해야 하는 저장·API·transaction 선택만 Implementation Choice로 고정한다. 취소된 `PROD-532`·`PROD-542`·`PROD-543`·`PROD-544`는 이 change의 authority, dependency 또는 구현 입력이 아니다.

## Decision Records

### Profile Tag는 canonical Hashtag identity를 참조하는 관계다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: Profile 관심사를 bio 문자열, 별도 ProfileTag identity 또는 Post와 Profile이 공유할 canonical Hashtag identity 관계 중 무엇으로 표현할지 정해져야 저장·검색의 이름 identity가 갈라지지 않는다.
- Decision Outcome: Profile Tag는 Post와 Profile이 공유하는 canonical Hashtag identity를 Profile이 참조하는 구조화 관계다. bio에서 추출·동기화하지 않으며 관계에 제품상 개수·순서·공개 배열 순서 보장은 없다.
- Alternatives Considered: bio 파생은 Owner가 명시적으로 편집한 목록을 보존할 수 없어 제외했다. 별도 ProfileTag identity는 같은 이름의 Post Hashtag와 정규화·검색 identity를 분리하므로 제외했다.
- Consequences: Post와 Profile의 관계 생성 방식은 독립적으로 유지되지만 canonical Hashtag identity를 나타내는 저장 row를 공유할 수 있어야 한다. Hashtag 관련 Profile 목록 탐색과 검색창의 Hashtag·Hashtag Name 검색은 이 관계 존재만으로 활성화되지 않는다.
- Confirmation / Follow-up: 저장 구조가 추가된 뒤 같은 canonical Hashtag identity가 Profile 관계에서 재사용되는지, bio 비파생과 관계 집합 semantics를 DB·service test에서 확인한다.

### canonical Hashtag identity와 Profile 관계를 additive tables로 저장한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: 현재 DB에는 Hashtag 구현이 없고, `PROD-526`이 canonical Hashtag identity와 Profile 관계의 유일성·Profile 생명주기를 저장해야 한다.
- Decision Outcome: UUID identity, 고유한 canonical `name`, first-write-wins `display_name`을 가진 `hashtag` table과 `profile_id`·`hashtag_id`를 가진 `profile_hashtag` relation table을 additive하게 추가한다. 관계 table은 `(profile_id, hashtag_id)` identity 조합만 유일하게 보장하며 position column·순서 제약·제품 max count를 두지 않는다. Hashtag Name의 syntax·normalization·length·canonical-name uniqueness와 최초 입력 표기 보존은 Hashtag가 소유한다. Lifecycle State가 Deleted로 전이됐다는 사실만으로 관계를 제거하지 않는다. Profile row 물리 삭제의 FK cascade는 별도 DB safety 경로로 유지하며 canonical Hashtag row와 다른 Profile/Post 관계를 삭제하지 않는다. 관계가 없어져도 Hashtag row를 자동 삭제하지 않으며 기존 bio·Post data를 backfill하지 않는다.
- Alternatives Considered: Profile row의 JSON/string array는 canonical Hashtag identity와 관계 유일성을 잃으므로 제외했다. 이름을 중복 저장하는 별도 `profile_tag` table은 Post와 공유 identity라는 canonical 계약에 맞지 않는다. position column과 개수 제약은 승인된 계약에 없으므로 추가하지 않는다. 기존 bio backfill은 명시적 Owner 선택이 아니므로 제외했다.
- Consequences: migration은 새 table과 identity 제약만 추가하고 기존 binary가 이를 무시할 수 있다. 미래 Post Hashtag 구현은 같은 `hashtag` identity를 재사용할 수 있지만 Post relation과 검색 index는 이번 change에 포함되지 않는다. 관계 조회나 API 배열의 반환 순서는 계약에 포함되지 않는다.
- Confirmation / Follow-up: 비활성화·정지·Deleted 상태 전이에서 관계가 보존되는지 service test로 확인한다. 물리 Profile row 삭제의 FK cascade safety와 canonical Hashtag row·다른 Profile 관계 보존은 별도의 DB test로 검증한다. 관계 cleanup이 필요해지면 별도 canonical 보존·파기 정책을 먼저 확정한다.

### Hashtag가 Name syntax와 identity normalization을 소유한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-527`
- Status: Active
- Context / Problem: JavaScript와 PostgreSQL의 단순 lowercase 또는 client별 구현에 identity 생성을 맡기면 locale·Unicode 처리와 길이 계산이 달라질 수 있다.
- Decision Outcome: Hashtag가 앞의 선택적 ASCII `#`와 바깥 공백 제거, Unicode NFKC, locale 비종속 `toLowerCase()`, 최종 결과의 code point 길이·허용 문자(1~20개의 `Letter | Number | _`) 검증과 canonical-name uniqueness를 소유한다. 최초 유효 입력에서 NFKC까지 적용한 대소문자 표기는 `display_name`에 저장하고 같은 canonical identity의 후속 입력으로 갱신하지 않는다. Profile Tag 관계는 Hashtag를 resolve/create한 canonical identity를 사용하며, 관계 계층은 Hashtag Name 규칙을 복제하지 않는다. client는 빠른 feedback을 위해 같은 규칙을 미러링할 수 있지만 server Hashtag 결과가 권위다.
- Alternatives Considered: Unicode full case folding은 JavaScript 표준 API가 없어 별도 table/package의 지속 관리가 필요하고 `Straße`와 `Strasse`처럼 제품이 동일 identity로 확정하지 않은 입력까지 합치므로 제외했다. locale 종속 `toLocaleLowerCase()`와 DB collation에 uniqueness를 위임하는 방식도 제외했다. client-only normalization은 우회 가능하고 플랫폼별 결과가 갈릴 수 있어 제외했다.
- Consequences: canonical `name`과 공개 표시 `display_name`이 분리된다. Profile 관계 validation은 입력을 Hashtag identity로 resolve한 뒤 같은 identity가 목록에 두 번 나타나는지 확인하고, 후속 casing 입력은 최초 표시 이름을 바꾸지 않는다.
- Confirmation / Follow-up: 공백·`#`, compatibility 문자, 대소문자, composed/decomposed 입력, astral code point, 길이 경계, first-write-wins 표시와 canonical identity duplicate vector를 Hashtag core·API·client parity test로 확인한다.

### GraphQL Profile은 Hashtag Node 목록을 Tags로 반환한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/design/profile-tags.md`, `PROD-489` 확정 결정 기록, `PROD-490`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-527`
- Status: Active
- Context / Problem: backend와 universal client가 현재 필요한 identity·빈 상태를 호환 가능한 GraphQL shape로 공유해야 하지만 Hashtag 전용 조회·navigation은 제외되어 있다.
- Decision Outcome: `Profile.tags: [Hashtag!]!`는 global `id`와 최초 입력 표기를 보존한 공개 `name`을 가진 Hashtag Node를 반환한다. 배열의 요소 순서는 API 계약이 아니며 소비자는 순서에 의존해서는 안 된다. Profile Origin과 연결된 Instance Kind가 Local인 모든 Profile은 configured instance ID와 무관하게 유효한 관계를 반환하고, 현재 범위의 Remote Profile은 빈 목록을 반환한다. `UpdateProfileInput`은 대상 ID를 받지 않고 `usingProfile`이 검증한 세션의 selected Profile을 대상으로 한다. 선택적 `tags: [String!]`에 배열이 오면 전체 replacement, 빈 배열이면 전체 제거, 생략 또는 `null`이면 기존 목록 보존으로 처리한다. `UpdateProfilePayload.profile`에서 최신 Hashtag Node 목록을 선택할 수 있게 한다.
- Alternatives Considered: normalized string list는 공유 Hashtag identity를 API 경계에서 잃어 Relay가 동일 Node를 정규화할 수 없으므로 제외했다. connection은 독립 pagination이 필요 없는 현재 범위에 과하다. nullable output은 빈 목록과 미지원 상태를 불필요하게 분리한다. 별도 Profile Tag mutation은 다른 Profile 표현 값과 같은 저장 action이라는 계약을 깨뜨린다.
- Consequences: output은 Hashtag identity와 표시 이름을 분리해 제공하고 input은 이름 문자열 명령을 유지한다. 대상 `id` 제거는 Profile update caller가 selected Profile 세션 경계를 사용하도록 공개 input을 좁힌다. client는 Hashtag `name`을 표시하고 canonical lowercase 문자열이나 배열 순서에 의존하지 않는다.
- Confirmation / Follow-up: schema snapshot과 GraphQL integration에서 global ID·최초 입력 표기, omitted·null·empty·nonempty input, Local/Remote output, 배열 순서 비보장과 mutation payload cache 동기화를 검증한다.

### Profile 값과 Tag 관계를 한 transaction으로 교체한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-489` 확정 결정 기록, `PROD-490`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`
- Status: Active
- Context / Problem: 기존 update resolver에 relation delete/insert를 별도로 추가하면 validation 또는 저장 실패 때 scalar Profile 값만 반영되거나 동시 update가 섞일 수 있다.
- Decision Outcome: GraphQL `usingProfile` 경계가 검증한 selected Profile identity를 사용하고, Core는 Active Account의 Owner·Local Profile에 대해 Lifecycle State `Active`와 Suspension State `Normal`인 editable 조건을 재확인한다. 하나의 DB transaction에서 실제 제공된 scalar field만 dynamic `UPDATE`하고 Hashtag resolve/create와 전체 relation replacement를 처리한다. scalar 입력이 없으면 불필요한 Profile `UPDATE`를 생략한다. 공개 조회 visibility도 Lifecycle State `Active`와 Suspension State `Normal`을 사용한다. explicit `SELECT ... FOR UPDATE`, table lock 또는 advisory lock은 사용하지 않고 일반 relation DML, unique constraint와 conflict 처리를 사용한다. 같은 Profile의 concurrent full-list replacement 순서와 strict last-writer 결과는 계약하지 않는다.
- Alternatives Considered: scalar update 뒤 별도 relation transaction은 부분 commit 위험 때문에 제외했다. 별도 Tag mutation은 같은 저장 action 계약과 draft 복구를 복잡하게 한다. optimistic version field 추가는 현재 Profile 공개 계약을 확장하므로 채택하지 않았다.
- Consequences: GraphQL resolver의 직접 row update 일부를 transaction/service 경계로 이동해야 한다. validation·권한·Hashtag resolve/create·relation 실패는 모두 요청 전 상태를 보존해야 한다. 미제공 scalar 값은 stale authorization snapshot으로 다시 쓰지 않는다.
- Confirmation / Follow-up: scalar와 tags 동시 성공, 각 실패 rollback, concurrent partial scalar update 보존과 서로 다른 Profile의 Hashtag 역순 upsert 경합을 database integration test로 검증한다. 같은 Profile concurrent replacement의 strict 전체 목록 결과를 보장하는 테스트는 두지 않는다.

### Profile Tag 제거 action은 시각 크기와 플랫폼 target을 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-tags.md`, `PROD-523` (PR #394), `PROD-491`, `PROD-522`, `PROD-527`
- Status: Active
- Context / Problem: 공용 제거 action을 `44×44` 하나로 고정하면 Web compact geometry와 충돌하고 Android의 `48×48 dp` 기본 target보다 작다. 반대로 공용 `32×32` control만 사용하면 iOS·Android target을 충족하지 못한다.
- Decision Outcome: 제거 action은 compact `32×32` 시각 크기를 유지하되 실제 target을 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`로 분리한다. target 확장은 동작과 대상 Tag를 설명하는 accessibility label/state 및 키보드 동작을 바꾸지 않는다.
- Alternatives Considered: 모든 플랫폼에 `44×44`를 적용하는 방식은 Android 기준보다 작고 Web 밀도를 불필요하게 키워 제외했다. Native target을 후속으로 미루는 방식은 공용 component가 Android/iOS에서도 사용되는 현재 범위와 맞지 않아 제외했다.
- Consequences: 공용 component는 플랫폼별 target 값을 선택하되 보이는 chip과 제거 glyph의 compact geometry를 유지해야 한다. `PROD-491`이 target 구현과 component 검증을 소유하고 `PROD-527`은 route 연결 뒤 Web·Android·iOS runtime 회귀를 검증한다.
- Confirmation / Follow-up: Web에서 `32×32 CSS px`, iOS에서 `44×44 pt`, Android에서 `48×48 dp` 실제 target과 공통 `32×32` 시각 크기를 component·runtime 검증으로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
