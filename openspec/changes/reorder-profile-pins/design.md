<!-- Optional, non-binding notes for this session. -->

## Current Constraints

- 조사 기준은 `main`의 `4eb121b2a44b174481181d9dad3d9b8ec9e85b99`다. 제품 계약은 canonical·PROD-1234와 현재 사용자 합의가 소유한다.
- `packages/core/db/tables.ts`의 `ProfilePinnedPosts`는 nullable `position`, Profile/Post 중복 방지와 Profile/position 중복 방지를 이미 제공한다. Local pin은 현재 `position` 없이 추가되며 관계 ID로 정렬된다. Remote는 `position`으로 정렬된다.
- `packages/core/services/profile-pin.ts`는 고정·해제 transaction 이후에만 Profile Update effect를 시작한다. effect 시작 실패는 저장 결과를 되돌리지 않는다.
- `apps/api/src/graphql/resolvers/profile/field/pinned-posts.ts`와 `packages/fedify/src/local-profile-featured.ts`는 Local 순서를 각각 관계 ID로 계산한다. Featured cursor도 관계 ID를 사용한다.
- `apps/app/src/components/post/PostList.tsx`는 고정 목록 전체와 chronology connection을 따로 읽는다. 기존 `ProfilePinAction.tsx`는 mutation payload로 고정 목록을 갱신한다.

## Practical Approach

Local과 Remote의 binary 정렬 키 통일은 현재 사용자가 선택한 구현 방향이다. 아래의 컬럼명·라이브러리·API shape와 전환 방법은 이 방향과 기존 제품 계약 안에서 실제 코드에 맞게 조정할 수 있다.

1. Local과 Remote의 고정 순서 저장을 공통 `bytea` 기반 binary fractional ordering key로 통일한다. 전환은 nullable `order_key`를 추가하는 방식부터 검토하고, 전환 시 기존 관계 ID·Post ID·membership와 Local `id ASC`·Remote `position ASC, id ASC`의 상대 순서를 보존한다. Remote 정수 `position`을 최종 정렬 방식으로 남기는 안은 사용하지 않는다.
2. Local 조회와 outbound Featured가 같은 raw key·관계 ID 순서를 사용하도록 맞춘다. 정렬만 바꾸고 Featured의 cursor 비교를 ID 기준으로 남기지 않는다. Remote snapshot writer는 수신 목록 순서에 맞는 binary key를 생성한다. snapshot 교체·빈 목록·Featured URI 제거의 정리 경로도 함께 전환하고, Local/Remote 판별에 key의 null 여부를 사용하지 않는다. Remote의 수신·표시 순서와 기존 권한은 유지한다.
3. GraphQL에는 selected Profile을 대상으로 하는 순서 변경 mutation을 추가한다. `AccountProfileRole.MEMBER`와 기존 selected Profile 경계를 재사용하고 임의 Profile ID를 입력받지 않는 방향을 우선한다. 성공 payload는 영향받은 Profile identity와 실제 고정 목록을 반환해 기존 Relay record를 갱신한다.
4. 이동 대상과 목적지 이웃의 Post ID로 서버가 새 key를 계산하는 입력을 우선 검토한다. raw binary key를 클라이언트 입력으로 신뢰하지 않고, 서버가 같은 Profile의 현재 고정 항목인지 확인한다. 조회 불가한 관계는 보존하고 stale한 입력을 pin/unpin으로 보정하지 않는다. 같은 순서의 재요청은 불필요한 변경과 effect 없이 처리한다.
5. 순서 저장은 transaction에서 처리한다. 선택한 key의 uniqueness 충돌·rollback과 동시 변경을 검증하고, 필요하면 원자적 조건부 DML과 제한된 재시도를 사용한다. 단순 순서 경합을 완벽히 직렬화하려고 Profile lock·advisory lock이나 새 revision 체계를 추가하지 않는다.
6. Profile pinned segment의 action 소유 경계에서 mutation을 실행하고 각 고정글 메뉴에 이동 항목을 조립한다. `useMutation`의 pending과 서버 응답을 사용하며 별도 optimistic 정렬이나 전역 Store 조작은 먼저 추가하지 않는다. 성공 응답을 요청 actor Store에 반영하고 chronology connection과 다른 actor Store는 유지한다.
7. 실제 순서가 바뀐 commit 뒤에는 기존 Profile Update effect를 재사용한다. 변경 없음·실패에는 effect를 시작하지 않는다. 외부 delivery 실패는 이미 저장된 순서를 되돌리지 않는다.

## Alternatives and Traps

- 사용자가 고른 방식은 기존 메뉴의 위·아래 이동과 즉시 저장이다. 드래그 편집 화면은 더 긴 편집 흐름과 별도 저장 상태가 필요하므로 이번 범위에서 제외한다.
- 관계를 삭제하고 다시 고정하면 고정·해제 의미와 identity가 바뀌므로 재정렬 수단으로 사용하지 않는다. 정수와 binary 모두 기존 관계의 순서만 갱신한다.
- visible 목록만 새 pin set으로 덮으면 숨겨진 관계가 사라질 수 있다. 실제 membership를 보존하면서 순서만 변경한다.
- 실제 응답이 갱신하는 Profile 범위에 맞춰 처리하고 전체 목록 재조회나 actor reset은 추가하지 않는다. 메뉴·focus는 기존 공용 ActionMenu 수명을 따른다.

## Binary Ordering Key 조사 · 2026-10-27

### 의미와 기존 근거

현재 사용자는 Local과 Remote 모두 binary 키로 통일하도록 요청했다. 이 세션의 구현 방향은 `bytea`에 가변 길이 fractional ordering key를 저장하는 것이다. 특정 알고리즘이나 라이브러리는 아직 선택하지 않았다. 정수를 고정 길이 bytes로 인코딩하는 것만으로는 중간 삽입의 여유가 생기지 않는다. 핵심은 이웃 key 사이에 새 key를 생성하는 fractional indexing이다.

PR #950의 2026-09-19 리뷰는 문자열 fractional key를 제안했고, 2026-09-22 리뷰는 당시 재정렬 계약이 없으므로 ordering key를 제거하도록 정리했다. 마지막 리뷰는 실제 재정렬이 도입될 때 collation·동일 gap 충돌·rebalance·cursor를 함께 설계하라고 명시했다. 이는 과거 검토 근거이며, 이번 binary 통일 방향의 근거는 현재 사용자 지시다.

### 정수와 binary 비교

| 항목               | 정수 position                                                                               | binary fractional key                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 한 칸 위·아래 이동 | 이웃 두 행의 값 교환으로 가능하다. 전체 재번호 매기기가 필수는 아니다.                      | 초기화·재균형이 없는 일반 이동은 이동한 행의 key 하나를 바꾼다.                         |
| 임의 위치 이동     | 연속 정수는 구간 갱신이 필요할 수 있다. 간격을 둔 정수도 여유가 소진되면 재배치가 필요하다. | 이웃 사이에 가변 길이 key를 만든다. 반복해서 좁은 gap을 쓰면 key가 길어질 수 있다.      |
| 저장·비교          | 현재 `integer`는 4 bytes다.                                                                 | `bytea`는 가변 길이와 저장 overhead가 있으므로 정수보다 작거나 빠르다고 단정할 수 없다. |
| 도입 범위          | 기존 컬럼을 활용할 수 있지만 Local 조회·새 pin·Featured를 함께 바꿔야 한다.                 | 새 컬럼·초기 key 생성·호환 전환과 binary cursor 처리가 필요하다.                        |
| 이번 판단          | 비교한 대안이다. 전환 중 호환용으로 남길 수 있으나 최종 정렬 방식으로 사용하지 않는다.      | 현재 사용자가 Local·Remote 공통 저장 방향으로 선택했다. 성능 우위는 검증하지 않았다.    |

PostgreSQL 18의 `bytea` 비교는 앞에서부터 bytes를 비교하고, 같은 prefix이면 짧은 값을 앞에 둔다. 예를 들어 raw bytes의 정렬은 `8000 < 800080 < 8001`이다. locale 기반 text collation을 맞출 필요가 없다는 점은 binary의 장점이다. 반면 임의의 bytes 두 개 사이에 항상 새 key를 만들 수 있는 것은 아니므로 검증된 key 형식·생성 규칙을 사용한다. 이 예시는 정렬 원리이며 특정 라이브러리의 출력 보장은 아니다.

### Remote 전송 순서와 공통 저장

ActivityStreams의 `OrderedCollection`은 `orderedItems`의 목록 순서를 전달하며 서버 내부의 정렬 키 타입을 규정하지 않는다. KOSMO의 `packages/fedify/src/remote-featured-snapshot.ts`는 현재 수신한 Post ID 목록의 배열 index를 정수 `position`으로 저장한다. 원격 서버가 정수 rank를 보내는 계약이 아니므로 binary 전환은 전송 형식을 바꾸지 않는다.

Remote snapshot을 저장할 때 수신 순서대로 유효한 binary key를 생성하고, 조회는 그 순서를 그대로 재현한다. Remote의 전체 snapshot 교체 방식과 Local 관리 mutation에서의 Remote 거부는 유지한다. Remote는 Local처럼 개별 이동을 하지 않으므로 한 행 갱신의 이점보다 저장·조회 표현을 통일하는 데 의미가 크다.

현재 `remote-featured-snapshot.ts`와 `remote-actor-materialization.ts`의 Featured URI 제거 경로는 `position IS NOT NULL`로 삭제 대상을 찾는다. 전환 후에는 검증한 Remote Profile 범위를 기준으로 처리하고 legacy 정수의 존재에 의존하지 않게 한다. Local에도 binary key가 생기므로 새 key의 존재만으로 Remote를 판별해서는 안 된다.

### TypeScript·Drizzle 후보

- `fraci`의 `fraciBinary`는 `Uint8Array` 기반 key 생성과 충돌 재생성을 제공한다. 확인한 source는 `0.19.0`, commit `8da612783259cab8f13f3a6330d91a8621f620a4`다. Node `>=22.13.0`과 Drizzle `^1.0.0-0`을 선언하지만 KOSMO에서의 호환 검증 결과는 아니다. 패키지는 설치하지 않았다.
- 로컬에 설치된 Drizzle `1.0.0-beta.22`에는 native `bytea()`가 있고 JS 값은 `Buffer`다. 우선 이 타입을 검토하고 `customType`을 선제 추가하지 않는다. 라이브러리의 `Uint8Array`와 DB driver의 `Buffer` 사이 round-trip을 실제 PostgreSQL에서 검증한다.
- `fraci`의 확인한 Drizzle 예제는 LibSQL을 사용한다. 예제의 `db.query.*`나 SQLite 오류 문구를 복사하지 않고 저장소의 SQL-like query builder와 PostgreSQL 오류 처리를 유지한다. 필요하면 core key 생성만 사용한다.
- 문자열 대안인 `rocicorp/fractional-indexing`은 binary 구현이 아니므로 이번 선택과 구분한다. 문자열 비교에 필요한 bytewise collation 검증을 binary key 생성 검증으로 대신할 수는 없다.

### 전환·충돌·검증 경계

- 공유 중인 `position`을 한 번에 `integer -> bytea`로 바꾸면 Remote snapshot writer와 구버전 workload가 가정한 타입과 달라진다. `memory/database/migrations/workflow.md`에 따라 breaking 변경으로 분류하고 in-place 전환을 기본안으로 삼지 않는다.
- 공통 nullable key를 추가하고 Local은 기존 `id ASC`, Remote는 `position ASC, id ASC` 순서대로 valid key를 채우는 전환안을 검토한다. 정수를 bytes로 cast해 라이브러리 key로 사용하지 않는다. 같은 Profile에 null key와 채워진 key가 섞인 구간에도 기존 전체 순서를 유지할 조회 전략과 재실행 가능한 초기화를 설계한다.
- Local 새 pin·이동과 Remote snapshot writer를 함께 전환한다. 구버전 workload가 남은 동안의 legacy 정수·ID 읽기, 필요한 dual write와 삭제 조건 호환을 실제 배포 방식에 맞춰 확인한다. legacy `position`은 호환 기간에만 남길 수 있으며 최종 목표는 양쪽 모두 binary 정렬이다. legacy 컬럼·제약 제거는 기존 contract gate를 통과한 별도 단계로 다룬다.
- 동일 gap에서 동시 생성한 key는 충돌할 수 있다. `(profile_id, order_key)` uniqueness와 재조회·제한된 재생성을 검증한다. PostgreSQL transaction이 unique violation으로 중단된 뒤 같은 transaction에서 단순히 계속 실행하지 않는다.
- 반복 이동에 따른 key 길이 증가와 재균형을 검토한다. 길이 제한·실패 복구를 정하지 않은 채 무제한 성장이나 완전한 충돌 방지를 가정하지 않는다. 라이브러리 문서의 lock 예제를 저장소 정책에 자동 적용하지 않는다.
- Local API와 Featured pagination은 같은 raw key·ID 순서를 사용한다. opaque cursor를 encode하더라도 비교는 복원한 bytes로 수행하고 Base64 문자열 정렬에 의존하지 않는다. Remote 조회도 같은 binary 비교를 사용한다. Local의 일반 이동마다 전체 목록의 key를 재작성하지 않는지도 확인한다.
- 구현 검증은 실제 DB 정렬·driver round-trip·dense gap·동시 이동/pin/unpin·숨겨진 관계·기존 cursor·양쪽 기존 순서 보존·Remote snapshot 교체와 정리·초기화 재실행·구버전 호환과 rollback을 포함한다. 이번 세션에서는 KOSMO 성능 측정, migration 실행과 제품 테스트를 하지 않았다.

### 조사 출처

- [PR #950: 최초 fractional key 제안](https://github.com/byulmaru/kosmo/pull/950#discussion_r4052644034)
- [PR #950: 재정렬 계약 도입 시 설계할 경계](https://github.com/byulmaru/kosmo/pull/950#discussion_r4070747578)
- [Figma 작성자의 fractional indexing 설명](https://madebyevan.com/figma/realtime-editing-of-ordered-sequences/)
- [PostgreSQL 18 binary type](https://www.postgresql.org/docs/18/datatype-binary.html)·[numeric type](https://www.postgresql.org/docs/18/datatype-numeric.html)·[bytea comparator source](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/varlena.c#L3837)
- [fraci 확인 source](https://github.com/SegaraRai/fraci/tree/8da612783259cab8f13f3a6330d91a8621f620a4/packages/core)·[binary Drizzle 예제](https://github.com/SegaraRai/fraci/blob/8da612783259cab8f13f3a6330d91a8621f620a4/packages/core/examples/drizzle-orm/server.binary.ts)
- [rocicorp 문자열 구현](https://github.com/rocicorp/fractional-indexing)·[Drizzle bytea 문서](https://orm.drizzle.team/docs/column-types#bytea)
- [ActivityStreams OrderedCollection](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-orderedcollection)

## Risks / Limits

- 선택한 저장 방식의 초기값·새 순서 값과 동시에 들어온 pin/unpin을 함께 검증해야 한다. 새 pin·해제가 순서 변경 때문에 복구되거나 사라지면 안 된다.
- Featured의 페이지 경계와 visibility filtering이 다르면 앱과 외부 조회의 순서가 갈라질 수 있다. 변경 없는 데이터에서 두 경로와 전체 페이지를 함께 확인한다.
- 이전 서버가 관계 ID만 읽는 배포 구간에는 새 순서를 표시하지 못할 수 있다. 구현 인계 시 실제 배포 방식과 API·UI 적용 순서를 확인한다. 이번 세션에서는 배포하지 않는다.
- 구버전 코드로 rollback하면 새 순서를 무시할 수 있다. 양쪽의 binary 전환에는 schema·초기화·호환 전환이 필요하므로 migration이 불필요하다고 가정하지 않는다. 실제 workload를 기준으로 운영 전환·rollback 범위를 확정하고 기존 migration gate를 따른다. binary 방향 선택을 production migration 실행 승인으로 간주하지 않는다.
- Web·Native·VoiceOver·TalkBack의 실제 runtime 검증은 아직 수행하지 않았다. 기존 Native release gate와 현재 Web 출시 범위를 유지한다.

## Open Questions

- 미정인 제품 결정은 없다. 2026-10-27 사용자가 메뉴 이동·즉시 저장과 Owner·Member 동일 권한을 선택했다.
- 같은 날 사용자가 Local과 Remote 모두 binary 키로 통일하도록 요청했다. 이 방향은 확정됐으며 다시 정수와의 선택을 묻지 않는다. 라이브러리·컬럼명·SQL·cursor 표현과 호환 전환 방법은 위 제품 계약과 기존 migration 정책 안에서 구현 검증으로 선택한다. 새 rollout·호환성 보장이나 완료 범위를 결정해야 할 때만 사용자에게 확인한다.
