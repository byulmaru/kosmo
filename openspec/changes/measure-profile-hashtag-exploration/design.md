## Current Constraints

이 문서는 현재 세션의 구현 제안이며 제품 권위는 canonical 정책과 PROD-556에 있다.
조사 기준은 main `8650253d7cfaea3cab94f35d318d381c838af6c9`다.

| 연결 지점                                                               | 현재 동작                                                       | 이번 작업에서 확인할 경계                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `apps/app/src/components/profile/ProfileHero.tsx`의 `ProfileTagLink`    | 정확한 Hashtag ID를 `NavigationLink`로 전달                     | 실제 TagChip 탐색 진입과 취소된 navigation 구분 |
| `apps/app/src/app/(tabs)/(protected)/hashtags/[hashtagId]/profiles.tsx` | `store-and-network`, `RouteBoundary`, not-found 표시            | 첫 요청 성공·오류, cache 재노출, retry          |
| `apps/app/src/components/profile/HashtagRelatedProfileList.tsx`         | `usePaginationFragment`, `loadNext(20)`, 실패 시 기존 목록 유지 | 첫 결과와 pagination 결과 분리                  |
| `apps/app/src/components/profile/ProfileListItem.tsx`                   | 기존 `onPress`를 링크 내용에 전달                               | Profile 결과 선택 시점과 중복 억제              |
| `apps/app/src/components/shell/NavigationLink.tsx`                      | navigation guard와 browser modifier 동작 보존                   | 클릭 의도와 실제 navigation, 새 탭·키보드       |
| `apps/app/src/analytics/events.ts`                                      | 기존 Profile·Post·Follow·검색 이벤트 타입                       | 이번 event의 작은 payload                       |
| `apps/app/src/analytics/AnalyticsSessionBridge.tsx`                     | Account identify/reset                                          | 이전 Account의 늦은 응답 격리                   |

현재 Web adapter는 `defaults: '2026-05-30'`, `mask_personal_data_properties: false`,
`disable_session_recording: true`를 사용한다. PR #955는 병합됐고 loopback 차단 PR #984는 조사 시점에
열려 있다. 구현 시작 시 main을 다시 확인하고 병합된 보호를 보존한다.

## Practical Approach

### Session과 관측

TagChip에서 확인한 진입을 route 수명과 연결하고 무작위 불투명 `profile_tag_exploration_session_id`를 생성한다.
공통 Hashtag를 참조하는 Profile Tag에서 관련 Profile을 탐색하는 session이라는 뜻이다. Account는 기존
identify/reset을 사용하고 custom payload에 중복하지 않는다. 확인된 Hashtag identity는 `hashtag_id`로 수집한다.
직접 URL이나 history 복귀를 TagChip 진입으로 추정하지 않는다. 이탈 뒤 새 TagChip 진입은 새 session이다.
ID 생성에 실패하면 분석만 건너뛴다. Native는 기존 no-op adapter 경계를 유지한다.

Account가 바뀌면 이전 session의 관측을 닫고 늦은 응답을 무시한다. 식별자가 바뀐 다음 이전 session의
종료 이벤트를 보내 새 Account에 귀속시키지 않는다. route focus·blur, navigation guard와 요청 cleanup이
어떤 순서로 실행되는지는 route 테스트로 확인한다. 렌더마다 ID를 만들거나 전역 URL·history 추적기를 추가하지 않는다.

첫 요청이 성공해 표시한 목록을 `has_results | empty`로 한 번 기록한다. `store-and-network`에서 cache가
먼저 보이는 경우, current 요청의 성공과 단순 재노출을 구분한다. 기존 fetch policy·화면을 계측 때문에
바꾸거나 추가 요청을 만들지 않는다. 첫 오류 뒤 같은 session의 성공을 우선하고, pagination 결과로 첫
결과를 덮지 않는다. 결과 선택은 route의 후속 요청 성공을 기다리지 않고 기존 item activation에서 기록한다.

### Hashtag identity와 최소 수집 근거

`hashtag_id`에는 TagChip이 받은 GraphQL `Hashtag.id`를 그대로 사용한다. 저장소 근거는 다음과 같다.

- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`: Profile Tag는 공용 Hashtag 참조 관계이며 별도 identity가 아니다.
- `packages/core/db/tables.ts`: `Hashtags.id`는 이름과 분리된 UUID이고 기본 생성 방식은 `uuidv7()`다.
- `apps/api/src/graphql/resolvers/hashtag/ref.ts`, `apps/api/src/graphql/utils.ts`: Hashtag Node는 이 ID로 조회하고 Node ID를 제공한다.
- `apps/api/src/graphql/builder.ts`, `packages/core/global-id.ts`: global ID는 UUID 16 bytes와 typename을 이어 base64url로 인코딩한다. Hashtag 이름은 포함하지 않는다.
- `apps/app/src/components/profile/ProfileHero.tsx`: `ProfileTagLink`는 이미 이 ID를 정확한 Hashtag route에 전달한다.

DB UUID를 별도 속성으로 중복하거나 클라이언트에서 새 Hashtag identity를 만들지 않는다. 이름·slug·URL·이름의
base64/hash를 대체값으로 사용하지 않는다. 실제 계측 입력은 TagChip의 확인된 Node ID이며 임의 pathname이나
route parameter를 신뢰해 복사하지 않는다. not-found라도 진입 때 확인한 ID가 남아 있으면 같은 값을 유지한다.
확인된 ID가 없으면 `hashtag_id`만 생략하고 수집 누락을 검증 결과에 남긴다. 제품 흐름과 전체 오류 집계는 유지한다.

전체 네 비율에는 Hashtag ID가 필요하지 않다. 이번 수집 항목 추가는 향후 Hashtag별 탐색량·도달/사용·선택률·Empty/Error·
추세를 분석할 수 있는 원천 자료를 보존하기 위한 명시적 수집 변경이다. 무작위 session ID만으로는 여러 탐색을
같은 Hashtag로 묶을 수 없다. 안정적인 ID 하나로 목적을 충족하고 이름이나 Profile 정보를 더 보내지 않는다.
이 ID는 암호화나 익명화가 아니다. Hashtag 자료와 Account 행동을 결합하면 관심 주제를 연결할 수 있다는
한계를 canonical에 기록했으며, 이번 허용을 다른 custom identifier나 표준 SDK 수집 변경으로 확대하지 않는다.

### Account 전환 실패 검증

기존 `apps/app/src/analytics/client.web.ts`는 reset·identify 예외를 삼키고 capture를 계속 허용한다.
`apps/app/src/analytics/client.test.ts`의 FakePostHog는 reset 실패 시 A의 식별자를 유지하며,
reset 성공 뒤 identify 실패 시에는 익명 식별자를 유지한다. 이는 코드·기존 테스트의 관찰이며 production
장애나 신규 계측의 실행 검증 결과가 아니다. 로컬 session을 분리했다는 사실만으로 B 귀속을 보장하지 않는다.

구현 시 mock/stub의 capture 호출에서 event payload와 함께 당시 `get_distinct_id()`·`$user_id`를
테스트 관측값으로 기록한다. 이 테스트 관측값을 실제 custom property에 추가하지 않는다.

| 주입 조건                        | capture에서 확인할 값              | 함께 확인할 동작                                     |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| A에서 B로 정상 reset·identify    | B의 식별자                         | A의 늦은 응답을 새 session으로 보내지 않음           |
| reset이 상태 변경 전에 throw     | 기존 stub에서는 A의 식별자가 남음  | B 귀속을 보장했다고 주장하지 않고 제품 흐름은 계속됨 |
| reset 성공 뒤 identify가 throw   | 기존 stub에서는 익명 식별자가 남음 | 실제 귀속과 인증 WAA 판정 한계를 기록함              |
| 이후 기존 호출에서 identify 성공 | 이후 capture의 B 식별자            | 실패 중 event가 자동으로 바로잡혔다고 추정하지 않음  |

route/bridge 순서와 이전 session의 마지막 event·새 session의 첫 event를 함께 실행해 확인한다.
SDK fault는 mock/stub/fault injection으로 재현하며 production 장애를 만들지 않는다. 기존 fail-open과
직접 capture 허용을 유지하고 별도 recovery system·전송 gate·재귀속 정책을 추가하지 않는다.
귀속이 보장되지 않는 경로와 영향받는 지표를 검증 결과·handoff에 기록한다. 더 강한 보장이 필요해지면
현재 계약을 충족했다고 표시하는 대신 별도 계약 변경 여부를 검토한다.

### Event 초안

아래 event 이름과 분해 방식은 구현 시 같은 계약을 만족하는 더 작은 구조로 바꿀 수 있다.
공통 property는 `profile_tag_exploration_session_id`와 확인된 `hashtag_id`다. 두 이름과 수집 의미는 이번 계약에 따른다.
각 event는 진입 시 고정한 같은 Hashtag ID를 사용하며 다른 Hashtag의 늦은 응답으로 덮지 않는다.

| Event                                 | 추가 custom property                                               | 의미                                         |
| ------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `profile_hashtag_exploration_started` | 없음                                                               | 확인된 TagChip 탐색 진입                     |
| `profile_hashtag_results_loaded`      | `stage`: `initial`, `pagination`; `result`: `has_results`, `empty` | 해당 요청의 성공과 결과 표시                 |
| `profile_hashtag_results_failed`      | `stage`: `initial`, `pagination`                                   | 원문 없는 요청 실패 분류                     |
| `profile_hashtag_result_selected`     | 없음                                                               | session의 첫 Profile 결과 선택               |
| `profile_hashtag_exploration_ended`   | 없음                                                               | 탐색 이탈·다른 Hashtag·Account 전환으로 종료 |

초기 실패 event만 보고 최종 `error`를 확정하지 않는다. 첫 성공은 즉시 성공으로 집계할 수 있고, 성공이
없는 initial failure는 실제 session 종료 근거와 함께 최종 오류로 집계한다. 성공과 선택은 session별로
중복 제거한다. 전송 실패를 제품 재시도와 연결하지 않는다.

종료 관측 유실은 실패가 없었던 이탈과 다르다. 종료 근거가 없는 initial failure를 시간 경과만으로
`error`로 바꾸거나 SDK의 30분 session을 탐색 session으로 사용하지 않는다. 브라우저 종료·offline로
완료를 확정할 수 없는 관측은 수집 한계로 표시하며 제품 계약을 임의의 timeout 정책으로 바꾸지 않는다.
종료 전달의 실제 한계는 구현·운영 검증에서 확인한다.

### 집계와 dashboard

1. 생산 환경·관측 시점의 인증 Account·제외 목록을 적용한다. 나중에 identify된 person이라는 이유만으로
   과거 익명 pageview를 WAA에 넣지 않는다. 표준 event metadata가 인증 시점을 증명하는지 실제 payload로
   확인하고, 부족하면 기존 승인된 인증 활동 관측과 연결할 방법을 구현 단계에서 검증한다.
2. Account와 탐색 session별로 첫 initial 성공, initial 실패, 종료, 첫 선택과 pagination 오류를 합친다.
   첫 성공이 있으면 그 결과를 쓰고, 성공 없이 종료한 initial failure만 `error`로 판정한다.
3. Session의 첫 목록 결과 시각으로 Asia/Seoul 주차를 정한다. error는 종료 시 최종 판정하되 최초 initial
   실패 관측 시각을 연결해 보존한다. 2026-09-22 사용자 선택에 따라 최종 오류는 첫 오류 발생 주에 귀속한다.
   성공으로 회복한 session은 성공 결과 시각을 사용한다.
4. Session을 합친 뒤 대상 주를 선택한다. event를 먼저 주 단위로 잘라 다음 주의 선택이나 retry 성공을
   잃지 않는다. 늦게 수신한 관측과 늦게 발생한 선택도 같은 계산 규칙으로 다시 집계하고 실행 시각을 남긴다.
5. 네 비율과 각각의 분자·분모, WAA, 기간·실행 시각·규칙 버전·제외 목록 버전을 저장 Insight·dashboard에
   표시한다. pagination 오류는 별도 품질 항목이다. URL·원문·Profile ID로 breakdown하지 않는다.
   `hashtag_id`는 이후 Hashtag별 분석에 사용할 원천 자료로 보존한다. Hashtag별 Insight·dashboard의 소유권은
   아래 범위 선택에서 별도로 다루며, 전체 지표의 WAA·중복 규칙과 계산식은 변경하지 않는다.

WAA는 기존 승인된 활동 집합을 유지한다. Hashtag 첫 목록 성공 Account가 같은 주 WAA에 누락되지 않는지
인증 화면 관측과 함께 확인한다. WAA 계측의 증거가 부족하면 완성된 비율이라고 보고하지 않는다.
실제 운영 제외 목록과 Account 값은 repository에 넣지 않는다.

### 합성 자료와 기대값

아래 session의 첫 결과는 같은 주에 발생한다. A·B·C·D는 모두 그 주의 인증 화면 관측이 있어 WAA에 속한다.

| Account / session | 첫 목록 흐름                    | 선택                 | 기대 결과                       |
| ----------------- | ------------------------------- | -------------------- | ------------------------------- |
| A / s1            | 성공, 결과 있음, 다음 page 오류 | 두 번                | `has_results`, 전환 1회         |
| A / s2            | 성공, 결과 없음                 | 없음                 | `empty`                         |
| B / s3            | initial 오류 뒤 성공, 결과 있음 | 다음 주 월요일 한 번 | `has_results`, 원래 주 전환 1회 |
| C / s4            | initial 오류 뒤 이탈            | 없음                 | `error`                         |
| D / s5            | 응답·오류 전에 이탈             | 없음                 | 확정 결과에서 제외              |
| 제외 Account / s6 | 성공, 결과 있음                 | 한 번                | 전체 지표에서 제외              |

기대값은 WAA 4, 사용 Account 2, 사용률 50%, `has_results` session 2, 선택 session 2, 선택률 100%다.
확정 결과 session은 4이므로 Empty와 Error는 각각 25%다. pagination 오류 session은 1이다.
분모 0, 여러 기기, 중복 전송, 익명·개발 환경과 종료 누락은 별도 경계 자료로 검증한다.
일요일 initial 오류 뒤 성공 없이 월요일 이탈한 자료는 일요일 주의 `error`, 월요일 retry 성공 자료는
월요일 주의 `has_results` 또는 `empty`로 따로 검증한다.

서로 다른 synthetic Hashtag Node ID 두 개를 사용해 같은 Hashtag의 여러 session·Account·retry·pagination에서
ID가 유지되고 다른 Hashtag에서는 달라지는지 capture payload를 대조한다. ID를 decode한 값이 fixture UUID와
`Hashtag` 타입으로만 구성되는지 확인하고, raw text·Canonical/Display Hashtag Name·검색어·Profile 값과 그
인코딩 대체값이 custom property로 복제되지 않는지 검증한다. not-found·확인되지 않은 ID의 생략과 수집 누락도
확인한다. 이는 ID 계측·검증이며 Hashtag별 저장 Insight를 완성했다는 증거로 사용하지 않는다.

### Hashtag별 Insight 범위 조사

2026-09-22 Linear의 PROD-556 관계와 `Hashtag`, `해시태그`, `Hashtag별`, `해시태그별`, `태그별`,
`Hashtag 지표`, `태그 분석`, `PostHog`, `breakdown`을 archived 포함 검색했다. 이 범위에서는 Hashtag별
breakdown Insight를 소유한 별도 이슈를 찾지 못했다. PROD-525는 탐색 기능, PROD-557은 검색→Profile/Follow
전환, PROD-575는 production 인수, breakdown 검색의 PROD-988은 UTM 분석을 맡는다.

| 선택             | PROD-556 완료 범위                                             | 별도로 정할 내용                                                             |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 후속 이슈로 분리 | opaque Hashtag ID 계측·검증과 기존 전체 네 비율 dashboard      | 후속 소유권, Hashtag별 탐색량·도달/사용·전환·품질·추세의 정의와 Insight 운영 |
| 이번 이슈에 포함 | 위 범위에 Hashtag별 지표 정의·Insight·dashboard·통합 검증 추가 | 도달의 분모, 기간·추세 표현, ID 표시·검토 책임 등 추가 제품 기준             |

후속 분리를 권장한다. 기존 승인 결과는 전체 네 비율이며 Hashtag별 분석 화면은 독립적으로 전달할 수 있다.
이는 추천일 뿐 확정 범위가 아니다. ID 계측·검증은 어느 선택이든 PROD-556 책임이며 사용자 결정을 기다린다.

## Alternatives and Traps

- 표준 pageview나 autocapture만으로 TagChip session과 최종 첫 결과를 추정하면 retry·익명 관측이 섞인다.
- 단순 `useEffect`에서 목록 길이만 읽으면 cache·pagination·재렌더를 첫 성공으로 중복 기록할 수 있다.
- `NavigationLink`의 child `onPress`는 navigation guard보다 먼저 호출된다. TagChip 진입에는 실제 이동을,
  결과 선택에는 승인된 item activation을 연결해야 한다.
- modifier·새 탭에서도 실제 TagChip 진입을 연결하는지 browser로 확인한다. 연결할 수 없는 경로를 직접 URL로
  임의 재분류하거나 조용히 누락한 채 완료로 표시하지 않는다. URL 공개 계약 변경이 필요하면 별도 결정을 받는다.
- SDK metadata를 custom allowlist와 함께 지우거나 Replay를 켜서 검증하는 방식은 이번 범위를 벗어난다.

## Risks / Limits

이번 세션은 코드·Cloud·Insight를 바꾸거나 앱 테스트를 실행하지 않았다. lifecycle 연결, authenticated WAA,
브라우저 종료·새 탭 관측과 실제 HogQL 결과는 구현 검증으로 남는다. analytics는 best-effort이므로 전달
완전성을 보장하지 않으며, 누락을 0%로 해석하지 않는다.

DB migration과 데이터 backfill은 없다. 도입 뒤 수집한 범위를 표시하고 과거 이벤트를 호환시키지 않는다.
롤백은 이 지표의 event 연결과 dashboard 변경에 한정하고 공용 identity·표준 metadata·Replay 상태를 유지한다.
PROD-795는 Done이지만 실제 개인정보·운영 준비와 production 증거는 별도로 확인한다.

## Open Questions

주 경계를 넘긴 최종 오류는 첫 오류 발생 주에 집계하도록 2026-09-22 사용자가 결정했다.
Hashtag별 breakdown Insight·dashboard를 PROD-556에 포함할지 후속 이슈로 분리할지만 사용자 결정 대기다.
Opaque Hashtag ID 계측·검증과 명명은 이번 요청으로 확정됐으며 나머지 기존 지표 계약을 다시 결정하지 않는다.
위 구현 연결점은 제안과 검증 과제이며 새 제품 결정이 아니다.
구현이 승인된 관측 범위를 충족하지 못하거나 공개 계약·수집 범위를 바꿔야 하면 그 경계에서 사용자에게 묻는다.
