## Context

PROD-526이 `hashtag`와 `profile_hashtag` 저장 구조, Hashtag Node, `Profile.tags` 공개 조회를 main에 추가했고, PROD-528이 `Hashtag.relatedProfiles`와 API 검증을 main에 추가했다. 공개 Profile은 TagChip에 Hashtag global ID와 이름을 이미 조회하지만 chip은 표시 전용이어서 관계 목록 route로 이동하지 않는다.

현재 API는 `ProfileConnection`을 공용 Profile node connection으로 사용하고, cursor connection resolver에서 SQL cursor predicate·정렬·limit을 함께 적용한다. Account 로그인은 GraphQL field의 `login` scope가 resolver 실행 전에 확인하며, Profile 공개 조건은 `visibleProfileWhere`가 Active Profile과 non-suspended Instance를 SQL에서 필터링한다. 관련 Profile 목록은 이미 저장된 ProfileHashtags 관계만 조회하므로 이 공용 predicate가 통과시키는 Local·Remote Profile을 모두 반환하고, 원격 lookup·refresh·materialization은 수행하지 않는다.

이번 change는 PROD-525가 소유하는 전체 탐색 계약을 API와 client slice로 나눈다. PROD-528은 완료된 API와 API 검증을 제공하고, PROD-529는 그 field를 소비하는 client route·navigation·목록 상태와 Web 중심 검증을 제공한다. PROD-525는 두 slice의 종단간 정합성과 archive를 소유한다.

## Goals / Non-Goals

**Goals:**

- 기존 Hashtag global identity에서 관련 공개 Profile을 조회하는 additive GraphQL connection을 제공한다.
- 인증, exact relation과 visibility를 candidate SQL과 page limit 전에 적용한다.
- 기존 Profile node/connection과 ID cursor 관례를 재사용하면서 기본·최대 page 크기를 20개로 고정한다.
- 성공·빈 결과·인증 실패·visibility·원격 조회 미수행·cursor pagination과 기존 검색 회귀를 API 경계에서 증명한다.
- 공개 Profile TagChip과 직접 route가 `/hashtags/[hashtagId]/profiles`에서 같은 Hashtag Node의 관계 목록을 열게 한다.
- `#<태그명> 관련 프로필` 제목, 기존 Profile 목록 item과 전용 Relay connection으로 loading/error/retry/empty/next-page/terminal 상태를 제공한다.
- TagChip navigation의 키보드·스크린리더·플랫폼 target과 TagChip부터 Profile 이동까지의 Web 흐름을 검증한다.

**Non-Goals:**

- Hashtag 이름 입력, `#` 모드, 자동완성, Hashtag/Hashtag Name 검색
- 기존 `searchProfiles`와 `profileByHandle` 계약 변경
- Remote Profile lookup·refresh·materialization과 ActivityPub 확장
- DB schema·migration·index 또는 dependency 변경
- API schema·resolver·connection ordering 변경
- Profile Tag 편집·공개 표시 구조의 재구현, analytics와 follow 전환 계측

## Implementation Guidance

### Current Constraints

- PROD-528이 `Hashtag.relatedProfiles(first:, after:): ProfileConnection!`, Account `login`, exact relation과 visibility-before-limit, `Profile.id ASC` opaque cursor, 기본·최대 20개 상한을 구현·검증했다. PROD-529는 이 API를 소비하며 schema·resolver·ordering을 변경하지 않는다.
- parent Node가 존재하지 않으면 기존 Node lookup이 `null`을 반환하고, 존재하는 Hashtag에 관련 Profile이 없으면 `relatedProfiles`가 빈 connection을 반환한다.
- 공개 `ProfileHero`는 TagChip에 필요한 Hashtag global ID와 Display Hashtag Name을 노출하는 GraphQL `name` projection을 조회하지만 현재 표시 전용 chip에는 이름만 전달하고 navigation target을 제공하지 않는다.
- 기존 search, followers와 following 화면은 Profile 목록 item과 pagination UX를 제공하지만 각자 query owner와 Relay connection key를 소유한다. Hashtag 관계 목록은 이 상태와 결합하지 않는다.
- 보호된 App route는 로그인 Account를 전제로 하지만 selected Profile을 요구하지 않아야 한다. API의 field-level login 경계보다 강한 client 전제나 별도 permission contract를 만들지 않는다.

### Recommended Approach

PROD-528은 기존 `Hashtag` Node에 field-level `login` auth scope의 `relatedProfiles` field를 추가했다. field는 공용 `ProfileConnection`, `first`·`after`, default/max 20과 `Profile.id ASC` cursor를 사용하며 exact relation·공용 visibility·cursor 경계를 page limit 전에 적용한다. API integration test가 인증 선행, selected Profile 없는 Session, exact/empty relation, visibility, 원격 조회 미수행과 pagination 회귀를 검증했다. 이 완료된 API 계약은 PROD-529 client의 입력이며 이번 slice에서 다시 구현하거나 변경하지 않는다.

PROD-529 client는 보호된 `/hashtags/[hashtagId]/profiles` route에서 path의 Hashtag global ID를 `node(id:)`에 전달하고, 응답이 Hashtag일 때 Display Hashtag Name을 노출하는 GraphQL `name` projection과 `relatedProfiles` 전용 Relay pagination fragment를 소비한다. Canonical Hashtag Name과 Display Hashtag Name은 identity나 query 입력으로 사용하지 않고 성공한 Node 응답의 화면 제목 `#<태그명> 관련 프로필`에는 Display Hashtag Name만 사용한다.

공개 Profile의 TagChip visual component는 표시 책임만 유지한다. `ProfileHero`의 공개 태그 진입점이 기존 chip을 `Link`·`Pressable`로 감싸 exact ID route와 `#<태그명> 관련 프로필 보기` 접근성 이름, Web 32 CSS px·iOS 44 pt·Android 48 dp 입력 target을 제공한다. 편집기의 제거 action과 validation은 변경하지 않는다.

관련 Profile 목록은 `searchProfiles`, followers와 following connection key에서 분리된 Hashtag 전용 Relay connection을 사용한다. 각 edge는 기존 Profile 목록 item과 Profile 이동·follow action을 재사용한다. 첫 loading과 첫 error는 route 맥락과 재시도를 유지하고, 다음 page error는 이미 표시한 edge를 지우지 않은 채 실패한 요청만 재시도한다. 중복 요청을 막고 `hasNextPage=false`이면 더 불러오기 affordance를 제거한다.

### Allowed Alternatives

client는 승인된 path·Node ID identity·제목·검색 상태 격리·관찰 가능한 상태와 접근성 계약을 보존한다면 route 내부의 query preload 방식과 component 분리는 기존 App 관례에 맞게 조정할 수 있다. followers/following 전용 fragment를 억지로 범용화하거나 검색 화면 mode를 추가하는 접근은 현재 범위의 대안이 아니다.

### Known Traps

- `usingProfile` scope를 사용해 selected Profile 없는 Account를 거부하지 않는다.
- Hashtag `name`을 resolver 입력으로 받아 정규화·부분 검색하지 않는다.
- relation row ID나 `createdAt`을 cursor로 사용해 Profile cursor 계약을 바꾸지 않는다.
- 원격 Profile을 새로 조회하거나 materialize하지 않고 저장된 관계만 읽는다.
- SQL limit 이후 application filtering으로 숨겨진 Profile을 제거하지 않는다.
- page 상한을 API 전역 설정으로 바꿔 다른 connection의 공개 계약에 영향을 주지 않는다.
- Hashtag 이름이나 `#` text를 route identity로 사용하거나 `searchProfiles` query에 전달하지 않는다.
- Hashtag relation, search, followers와 following이 같은 Relay connection key나 pagination state를 공유하지 않는다.
- TagChip visual component에 편집 제거 action과 navigation 책임을 함께 넣지 않는다.
- 다음 page 실패에서 이미 표시한 Profile을 지우거나 중복 요청으로 같은 page를 여러 번 append하지 않는다.
- React Native Web 자동화와 source mapping을 iOS·Android 실제 runtime 완료 증거로 표현하지 않는다.

## Risks / Trade-offs

- [UUIDv7 `Profile.id ASC`는 같은 millisecond 안의 생성 순서를 표현하지 않는다] → 이 목록은 시간순 의미를 요구하지 않으며 immutable·unique 전체 순서만 사용한다는 결정을 명시한다.
- [결과 집합이 page 사이에 변경되면 새 관계가 이미 지난 cursor 앞에 들어갈 수 있다] → cursor 계약은 변경되지 않은 결과 집합의 중복·누락 방지를 보장하고 snapshot pagination은 도입하지 않는다.
- [Hashtag Node가 공개 lookup 가능하므로 비로그인 요청이 parent Hashtag 존재를 확인할 수 있다] → 기존 Hashtag Node 공개 계약은 유지하되 관련 Profile 후보 query는 field-level login scope 뒤에서만 실행한다.
- [additive field를 먼저 배포하면 아직 client 소비자가 없다] → PROD-528을 독립 배포 가능한 API slice로 유지하고 PROD-529가 schema를 소비한 뒤 전체 탐색을 활성화한다.
- [path가 opaque Hashtag ID라 사람이 URL만 보고 태그를 식별하기 어렵다] → exact identity와 이름 변경 안정성을 우선하고 Display Hashtag Name은 성공한 Node 응답의 화면 제목에 표시한다.
- [첫 network 요청이 완료되기 전에는 Display Hashtag Name을 표시할 수 없다] → 공용 PageHeader는 `관련 프로필` 맥락을 유지하고 Node 응답 뒤 승인된 전체 제목으로 갱신하며, 이름 query parameter나 stale client copy를 identity로 사용하지 않는다.
- [Web 자동화만 통과한 상태에서 Native 탐색이 완료됐다고 오해할 수 있다] → 공용 React Native 구현과 platform target mapping은 source 수준으로 검증하고 iOS·Android 실제 runtime QA는 별도 출시 gate로 남긴다.

## Migration Plan

데이터 migration과 backfill은 없다. additive GraphQL field와 schema snapshot, 통합 테스트는 PROD-528에서 먼저 배포됐고 PROD-529 client가 이를 소비한다. client 롤백은 TagChip navigation과 route 노출을 되돌리되 기존 표시 전용 TagChip과 API를 유지한다. 이미 배포된 client가 API에 의존하기 시작한 뒤에는 부모 PROD-525의 호환성·rollout 판단 없이 field를 제거하지 않는다.

## Open Questions

없음.
