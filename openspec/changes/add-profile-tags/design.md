## Context

현재 `packages/core/db/tables.ts`에는 Profile 저장 모델만 있고 Hashtag 또는 Profile-Hashtag 관계가 없다. `apps/api/src/graphql/resolvers/profile/ref.ts`의 Profile object와 `mutation/update.ts`도 scalar 표현 값만 조회·수정하며, update resolver가 직접 Profile row를 갱신한다. 공개 화면은 `apps/app/src/components/profile/ProfileHero.tsx`가 담당한다. Profile Tag controlled editor·client validation presentation은 선행 이슈 `PROD-491`이 제공하고, Profile 편집 화면의 최종 route·저장 흐름은 `PROD-492`가 제공한다.

이번 change는 `PROD-523`에서 승인한 Profile Tag 계약을 `PROD-526`의 저장·서비스·GraphQL 기반과 `PROD-527`의 Web·Android·iOS UI로 나눠 구현한다. Lifecycle State가 Deleted로 전이됐다는 사실만으로 Profile Tag 관계를 제거하지 않으며, 취소된 `PROD-532`·`PROD-542`·`PROD-543`·`PROD-544`는 선행 의존성이나 구현 입력이 아니다. 두 slice는 같은 `add-profile-tags` specs와 decisions를 공유하고, 부모 `PROD-522`가 종단 간 검증과 archive를 소유한다. Profile Tag 검색은 `PROD-525`의 별도 change이므로 검색을 가정한 API·index·navigation을 선제 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- Hashtag가 소유하는 정규화된 identity와 Profile 관계를 additive migration으로 저장한다.
- Local Profile Owner의 기존 update 안에서 표현 값과 전체 Tag 목록을 원자적으로 교체한다.
- 공개 Profile이 N+1 query 없이 normalized name을 `tags`로 반환한다. 반환 배열의 순서는 계약하지 않는다.
- 기존 Profile 편집·공개 component와 Relay record에 공용 TagChip UI를 연결한다.
- validation, 권한, visibility, 생명주기, migration, 접근성과 Web·Android·iOS 회귀를 독립적으로 검증한다.

**Non-Goals:**

- Profile Tag 검색 query, index 최적화, 결과 정렬·pagination과 TagChip navigation
- Post 본문 Hashtag 추출 또는 Hashtag Post List 구현
- Remote Profile Tag 수집·표시, actor refresh와 ActivityPub vocabulary
- 자동완성, 추천, trend, Followed Hashtag와 범용 Tag 관리 화면
- 선행 `PROD-491` editor와 `PROD-492` 저장 흐름의 재구축

## Implementation Guidance

### Current Constraints

- 기존 DB에는 canonical Hashtag identity 저장 구조가 없으므로 Profile Tag 관계만 추가할 수 없다. canonical identity 저장 구조와 Profile 관계를 같은 additive migration에서 시작하되 Post 관계를 함께 구현해서는 안 된다.
- JavaScript에는 Unicode full case folding 표준 API가 없다. 단순 `toLocaleLowerCase()`나 PostgreSQL `lower()`는 locale·Unicode 버전에 따라 canonical 계약과 달라질 수 있다.
- 현재 GraphQL Profile update는 authorization 조회와 Profile row update를 resolver에서 분리 수행한다. Tag 관계의 delete/insert를 그대로 덧붙이면 다른 Profile 값과 atomic하지 않고 동시 update가 섞일 수 있다.
- `Profile.tags`는 여러 Profile을 한 query에서 읽는 화면에서 사용되므로 Profile별 query를 수행하면 N+1 회귀가 생긴다. loader는 배열 위치를 의미 있는 계약으로 취급하지 않는다.
- 취소된 terminal deletion 계획을 구현하거나 기다리지 않는다. 별도 canonical 보존·파기 정책이 없는 상태 기반 관계 cleanup을 추가하지 않는다.
- `PROD-527`이 의존하는 `PROD-491` editor와 `PROD-492` route·mutation 결과는 현재 branch에 없을 수 있다. 두 결과가 도착한 뒤 기존 component를 재작성하지 않고 그 seam에 Profile Tag API·Relay 상태를 통합해야 한다.
- Relay가 mutation payload의 `Profile.tags`를 선택하지 않으면 서버 저장 성공 뒤 normalized record와 공개 화면에 이전 목록이 남을 수 있다.

### Recommended Approach

1. Core DB에 Hashtag가 소유하는 고유 normalized name의 Hashtag table과 Profile ID·Hashtag ID identity 조합을 가진 관계 table을 additive하게 추가한다. `(profile_id, hashtag_id)`를 유일하게 만들고 position column·순서 제약·제품 max count는 두지 않는다. Lifecycle State가 Deleted로 전이돼도 관계를 보존한다. Profile row 물리 삭제의 FK cascade는 별도 DB safety 경로로 유지하며 canonical Hashtag row와 다른 Profile/Post 관계를 삭제하지 않는다. 관계 해제 때 canonical Hashtag identity row는 자동 삭제하지 않는다.
2. Hashtag가 소유하는 순수 normalization boundary 한 곳에서 trim, 선택적 앞 `#` 제거, NFKC, locale 비종속 Unicode case folding, code point 개수와 `Letter | Number | _` 검증을 수행한다. Profile 관계는 이 boundary의 규칙을 복제하지 않고 입력을 Hashtag identity로 resolve/create한다. 구현은 Unicode version이 명확한 검증된 case-fold data 또는 package를 사용하고, API와 DB service가 같은 Hashtag 함수를 호출한다.
3. Active Account의 Owner·Local Profile에 대해 Lifecycle State가 `Deleted`가 아니고 Suspension State가 `Normal`인 editable 조건을 확인하고 Profile row를 잠근 하나의 DB transaction에서 Profile scalar update, Hashtag resolve/create, 기존 관계 삭제와 새 관계 insert를 수행한다. `tags`가 undefined 또는 null이면 관계 작업을 생략하고 빈 목록이면 전부 제거한다. 같은 Hashtag identity가 목록에 두 번 나타나는지 identity 기준으로 검증하며 resolve/create 경합은 unique constraint와 재조회로 수렴시킨다.
4. GraphQL Profile에 non-null 문자열 목록 `tags`를 추가하고, profile IDs를 묶어 관계를 읽는 request-scoped loader를 사용한다. loader와 resolver는 배열 위치나 API 반환 순서를 의미 있는 계약으로 정렬·보장하지 않는다. Profile Origin과 연결된 Instance Kind가 Local인 모든 Profile은 configured instance ID와 무관하게 유효한 관계를 반환하고, Remote Profile은 빈 목록을 반환한다. update payload는 갱신된 Profile에서 `tags`를 다시 읽을 수 있게 한다.
5. `PROD-491`의 controlled Tag editor를 `PROD-492`의 edit route·저장 action에 연결한다. `PROD-491`이 제공한 client validation을 재사용하고, 서버 결과를 권위로 유지하며 공통 parity fixture로 Hashtag normalization·경계·canonical identity duplicate 사례의 회귀와 server parity를 검증한다.
6. 공개 화면은 기존 `ProfileHero` fragment에서 `tags`를 읽고 bio 다음·follow count 전에 wrapping TagChip 목록을 렌더한다. chip은 Pressable/Link가 아닌 비대화형 표현으로 유지하고 배열 순서에 의존하는 UI 계약을 만들지 않는다. mutation fragment에도 `tags`를 선택해 같은 Relay Profile record를 갱신한다.
7. Storybook 또는 동등한 공용 상태 카탈로그에서 빈 목록, 임의 개수의 긴 값, validation, 저장 중, 실패 상태를 검증하고 Web E2E에서 Owner 저장부터 공개 Profile 표시까지 연결한다. Android·iOS는 같은 component test와 native render smoke로 확인한다.

### Allowed Alternatives

- Unicode case folding은 specs의 locale 비종속 full folding과 고정된 test vector를 만족한다면 검증된 dependency 또는 repository에 생성한 Unicode case-fold table 중 하나를 사용할 수 있다.
- Profile Tag 교체는 Profile row lock 뒤 delete/insert하거나 동등한 set reconciliation을 사용할 수 있다. 어느 방식이든 전체 목록 replacement, identity 유일성, 원자성과 동시 update 직렬화가 검증되어야 한다.

### Known Traps

- bio 또는 Post 본문에서 Profile Tag를 추출하거나 migration backfill하지 않는다.
- `toLowerCase()`를 full Unicode case folding으로 간주하거나 DB collation에 uniqueness를 위임하지 않는다.
- GraphQL resolver에서 Profile row를 먼저 update한 뒤 관계 변경을 별도 transaction으로 실행하지 않는다.
- API 소비자가 배열 순서를 의미로 해석하거나, delete/insert 사이에 부분 상태가 보이게 하지 않는다.
- relation identity 유일성을 application validation에만 맡기고 DB의 `(profile_id, hashtag_id)` 제약을 생략하지 않는다.
- Remote Profile에 저장된 actor metadata를 tag로 해석하거나 actor fetch를 시작하지 않는다.
- 검색용 endpoint, reverse lookup pagination, TagChip link 또는 검색 전용 index를 이번 change에 추가하지 않는다.
- client validation 성공을 서버 validation 대체로 사용하지 않는다.

## Risks / Trade-offs

- [Unicode case-fold 구현이나 Unicode version이 달라 같은 입력이 다른 identity가 됨] → 한 core normalizer와 versioned test vector를 사용하고 DB unique name 직전에 항상 같은 결과를 적용한다.
- [동시 Profile update가 서로의 Tag 집합을 덮거나 unique 오류를 노출함] → Profile row lock으로 replacement를 직렬화하고 Hashtag resolve/create 경합은 unique constraint와 재조회로 처리한다.
- [새 `tags` field가 목록 화면에서 N+1 query를 유발함] → request-scoped batch loader와 query-count 통합 테스트를 둔다.
- [클라이언트와 서버 validation 차이로 저장 때만 오류가 발생함] → Hashtag를 권위로 유지하고 공통 fixture의 parity를 검증하며 실패 뒤 draft를 보존한다.
- [선행 Profile edit 구현과 병합 충돌 또는 editor·route 중복이 생김] → `PROD-491` editor와 `PROD-492` route·Relay mutation을 확장하고 별도 흐름을 만들지 않는다.
- [앱 rollback 뒤 새 Tag data를 읽지 못함] → migration을 additive하게 유지해 이전 앱/API가 새 table을 무시할 수 있게 하고 operational rollback에서는 table과 data를 보존한다.

## Migration Plan

1. Hashtag와 Profile Tag 관계 table, Hashtag normalized-name 및 `(profile_id, hashtag_id)` identity·foreign-key 제약을 생성하는 additive migration을 만든다. position/check/max-count 제약은 추가하지 않는다. 기존 Profile·Post row와 bio는 변경하거나 backfill하지 않는다.
2. 빈 기존 database와 현재 production-equivalent 이전 schema 모두에 migration을 적용해 기존 Profile이 빈 tags로 조회되고 기존 API 동작이 유지되는지 검증한다. 관계와 GraphQL 배열의 순서를 계약으로 가정하지 않는지 확인한다.
3. DB/service/GraphQL 기반을 먼저 배포한다. 새 output field와 선택적 input은 기존 client 요청과 호환되며, 이전 client는 이를 사용하지 않는다.
4. `PROD-491` editor를 `PROD-492` 기반 Profile edit에 연결하고 공개 Profile UI와 함께 배포해 종단 간 저장·재조회·표시를 검증한다.
5. application rollback 시 이전 API/client를 먼저 복원하고 additive table과 저장 data는 남긴다. schema 제거가 필요하면 사용 중인 binary와 data 보존 여부를 확인한 별도 cleanup migration으로 수행한다.

## Open Questions

없음.
