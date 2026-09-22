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

TagChip에서 확인한 진입을 route 수명과 연결하고, 임의의 불투명 session ID를 생성한다. 제품용 Hashtag ID와
Account는 로컬에서 현재 작업을 구분하는 데만 사용하고 custom payload로 복사하지 않는다.
직접 URL이나 history 복귀를 TagChip 진입으로 추정하지 않는다. 이탈 뒤 새 TagChip 진입은 새 session이다.
ID 생성에 실패하면 분석만 건너뛴다. Native는 기존 no-op adapter 경계를 유지한다.

Account가 바뀌면 이전 session의 관측을 닫고 늦은 응답을 무시한다. 식별자가 바뀐 다음 이전 session의
종료 이벤트를 보내 새 Account에 귀속시키지 않는다. route focus·blur, navigation guard와 요청 cleanup의
어떤 순서로 실행되는지 route 테스트로 확인한다. 렌더마다 ID를 만들거나 전역 URL·history 추적기를 추가하지 않는다.

첫 요청이 성공해 표시한 목록을 `has_results | empty`로 한 번 기록한다. `store-and-network`에서 cache가
먼저 보이는 경우, current 요청의 성공과 단순 재노출을 구분한다. 기존 fetch policy·화면을 계측 때문에
바꾸거나 추가 요청을 만들지 않는다. 첫 오류 뒤 같은 session의 성공을 우선하고, pagination 결과로 첫
결과를 덮지 않는다. 결과 선택은 route의 후속 요청 성공을 기다리지 않고 기존 item activation에서 기록한다.

### Event 초안

아래 이름과 필드는 구현 시 같은 계약을 만족하는 더 작은 구조로 바꿀 수 있다.
공통 custom property는 `exploration_session_id` 하나다.

| Event                                 | 추가 custom property | 의미                                         |
| ------------------------------------- | -------------------- | -------------------------------------------- | ---------------------------- | ---------------------------- |
| `profile_hashtag_exploration_started` | 없음                 | 확인된 TagChip 탐색 진입                     |
| `profile_hashtag_results_loaded`      | `stage: initial      | pagination`, `result: has_results            | empty`                       | 해당 요청의 성공과 결과 표시 |
| `profile_hashtag_results_failed`      | `stage: initial      | pagination`                                  | 개인정보 없는 요청 실패 분류 |
| `profile_hashtag_result_selected`     | 없음                 | session의 첫 Profile 결과 선택               |
| `profile_hashtag_exploration_ended`   | 없음                 | 탐색 이탈·다른 Hashtag·Account 전환으로 종료 |

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
   표시한다. pagination 오류는 별도 품질 항목이다. URL·원문·대상 ID로 breakdown하지 않는다.

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
분모 0, 여러 기기, 중복 전송, 익명·개발 환경, 주 경계를 넘는 retry 성공과 종료 누락은 별도 경계 자료로 검증한다.

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
현재 미결정 제품 질문은 없다. 나머지 기존 지표 계약은 다시 결정하지 않는다.
위 구현 연결점은 제안과 검증 과제이며 새 제품 결정이 아니다.
구현이 승인된 관측 범위를 충족하지 못하거나 공개 계약·수집 범위를 바꿔야 하면 그 경계에서 사용자에게 묻는다.
