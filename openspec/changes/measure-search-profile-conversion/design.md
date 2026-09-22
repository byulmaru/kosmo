## Current Constraints

이 문서는 현재 세션의 구현 제안이며 영구 계약이 아니다. 계산 정책은 `docs/domain/policies/search-conversion-analytics.md`와 PROD-557이 소유한다.

- `apps/app/src/analytics/events.ts`의 검색 이벤트에는 journey 연결값이 없다. `follow_succeeded`는 `result: 'follow' | 'request'`를 함께 기록한다.
- `apps/app/src/app/(tabs)/(protected)/search.tsx`는 결과 조회·선택과 keyboard/recent/tab 제출을 소유한다. 같은 query 제출도 기존 이벤트가 발생하므로 이벤트 횟수를 곧바로 새 검색의 판정으로 사용하지 않는다.
- `apps/app/src/components/profile/ProfileListItem.tsx`는 여러 목록에서 재사용되며 내부에 Follow 버튼을 포함한다. 클릭 이벤트 전파만으로 Follow 클릭을 결과 navigation으로 해석하지 않는다.
- `apps/app/src/app/(tabs)/(profile)/[profileHandle]/_layout.tsx`가 유효한 Profile과 `ProfileHero` 표시를 소유한다. 하위 게시물 목록의 성공을 Profile 조회 성공의 추가 조건으로 만들지 않는다.
- `apps/app/src/components/profile/FollowButton.tsx`에서 `ProfileFollow`와 `ProfileFollowRequest` 응답을 구분할 수 있다. optimistic 표시·HTTP 완료만으로 성공을 기록하지 않는다.
- `AnalyticsSessionBridge.tsx`는 Account와 인증 상태를 읽지만 선택 Profile·PostHog session 경계는 아직 제공하지 않는다. 앱 인증 Session과 PostHog session은 별도 수명이다.
- 웹 adapter는 설정 누락·SDK 오류를 흡수하고 Native adapter는 no-op이다. 현재 `disable_session_recording: true` 설정은 PROD-741 범위다.

## Practical Approach

### 귀속 상태와 navigation

현재 탭의 메모리에 검색 맥락별 대상→journey 정보를 둔다. 대상 판정에 필요한 Profile ID와 navigation 정보는 로컬에서만 사용하고, 전송용 `journey_id`는 Account·Profile·검색어와 무관하게 생성한다. 최초 선택 시각, 성공 종류별 기록 여부, 시작 시점의 인증·선택 Profile·PostHog session을 함께 보관한다.

결과를 다시 선택하거나 기존 검색 화면으로 돌아오면 같은 대상의 journey를 재사용하고 최초 선택 시각을 연장하지 않는다. 실제 새 검색은 기존 귀속을 닫는다. 만료된 journey도 같은 검색 맥락에서 재선택 분모가 늘지 않도록 중복 판정은 유지한다. pagination, 재렌더, 조회 재시도를 새 검색으로 오인하지 않도록 현재 route 전환과 제출 동작을 함께 확인한다. 같은 query의 no-op 제출은 결과 맥락을 바꾸지 않는 현행 동작을 따른다.

선택에서 시작한 navigation과 대상이 일치하는 경우에만 Profile 성공 신호를 연결한다. URL의 handle만 보고 마지막 journey에 연결하지 않는다. 기존 route/navigation 경계와 callback을 사용하고 별도의 history stack, URL query, storage 또는 탭 간 공유 수단을 만들지 않는다. 새 탭·수정키 클릭·별도 직접 진입은 선택 맥락을 전달받지 못하므로 연결하지 않는다.

Follow를 시작할 때 해당 선택 맥락과 대상의 참조를 확보하고 완료 시점에 수명·대상을 다시 검사한다. 오래된 요청의 완료를 현재 journey에 붙이지 않는다. 검색 결과에서 선택 없이 누른 Follow는 분모를 새로 만들지 않으며, 이미 선택한 대상의 유효한 맥락이 전달된 경우에만 귀속 후보가 된다.

### 시간과 종료

성공 신호를 처리할 때 최초 선택으로부터 경과 시간이 `0 <= elapsed_ms <= 1800000`인지 확인한다. 타이머의 실행 시각이나 재선택 시각으로 window를 연장하지 않는다. 새 검색, Account·선택 Profile·인증 상태·PostHog session 변경과 문서 종료는 이전 참조를 무효화한다. 이미 기록한 분모와 성공은 취소하지 않는다.

PostHog 공개 session API를 웹 adapter에서 사용하고 초기 callback을 session 변경으로 오인하지 않는다. `onSessionId`는 기존 session이 있으면 등록 즉시 호출되고 이후 session/window 변화도 알린다. SDK가 다음 capture에서 session을 갱신할 수 있으므로 callback 관찰만으로 충분하다고 가정하지 말고, 설치 버전의 session 판정과 실제 outbound event의 session 일치까지 검증한다. 조회·관찰 목적으로만 SDK session을 사용하며 feature가 reset/identify를 호출해 수명을 바꾸지 않는다. 근거: [PostHog JavaScript SDK](https://posthog.com/docs/references/posthog-js), [session 문서](https://posthog.com/docs/data/sessions).

### 이벤트 제안

| 이벤트                            | 기록 시점                                                | custom 속성                                           |
| --------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `search_profile_journey_started`  | 같은 검색·대상의 최초 유효 선택                          | `journey_id`, `source: 'search_people'`               |
| `search_profile_view_succeeded`   | 선택한 대상의 유효한 Profile이 실제 표시된 첫 시점       | `journey_id`, `source: 'search_people'`, `elapsed_ms` |
| `search_profile_follow_succeeded` | 같은 대상의 `ProfileFollow` 성공 응답을 처음 확인한 시점 | `journey_id`, `source: 'search_people'`, `elapsed_ms` |

이벤트명과 payload는 구현 제안이며 기존 이름의 호환성 요구를 새로 만들지 않는다. `journey_id`를 PostHog person identity로 사용하지 않는다. 금지된 검색어·이름·handle·대상 ID와 파생값은 custom 속성에 넣지 않고, 기존 SDK 표준 metadata는 유지한다. 공통 이벤트·SDK 설정을 바꾸는 것은 이 제안에 필요하지 않다.

### 집계와 검증 fixture

기준 집계는 최초 start event를 `journey_id`별 한 행으로 만든다. 선택한 Asia/Seoul 기간의 시작 이벤트에 같은 journey의 성공을 연결하고, 각 성공 종류의 중복을 제거한다. 전체 분자는 조회·Follow 성공의 합집합이다. 성공만 있고 start가 없으면 분모나 분자를 새로 만들지 않는다. 기간 마지막 날에 시작한 journey를 위해 성공 조회 범위는 기간 끝 뒤 30분까지 열어 둔다. 마지막 시작 시각의 30분 window가 끝나기 전에는 잠정치로 표시한다.

PostHog의 사용자 단위 funnel 설정이 journey 수와 일치한다고 가정하지 않는다. 두 단계의 조회·Follow funnel을 제공하되, 같은 Account의 여러 journey가 분리되는지 fixture로 검증한다. 기본 funnel에서 승인된 집계 단위를 표현하지 못하면 `journey_id`별 SQL/HogQL insight를 기준 지표로 함께 제공한다. UI의 breakdown만으로 정확한 dedupe를 보장한다고 주장하지 않는다. 참고: [PostHog funnels](https://posthog.com/docs/product-analytics/funnels).

다음 fixture는 모두 관측 window가 끝난 뒤 검증한다. J5는 다른 종료 경계 없이 같은 PostHog session을 유지한 조건이다. A·B 등은 테스트 내 대상 표기이며 전송 속성이 아니다.

| journey | 입력                                                 | 전체 | 조회 | Follow |
| ------- | ---------------------------------------------------- | ---- | ---- | ------ |
| J1      | A 선택, 조회 성공, 뒤로가기·재선택, Follow 성공      | 1    | 1    | 1      |
| J2      | 같은 검색의 B 선택, 조회 실패, Follow Request만 반환 | 0    | 0    | 0      |
| J3      | 새 검색의 A 선택, 조회 실패, 실제 Follow 성공        | 1    | 0    | 1      |
| J4      | C 선택, 조회 성공, 새 검색 뒤 Follow 응답 도착       | 1    | 1    | 0      |
| J5      | D 선택, 정확히 30분에 조회 성공                      | 1    | 1    | 0      |
| J6      | E 선택, 30분 초과 뒤 조회·Follow 성공                | 0    | 0    | 0      |

기대값은 분모 6, 전체 분자 4, 조회 분자 3, Follow 분자 2다. 추가 fixture로 Account·선택 Profile·인증·PostHog session 전환, 다른 대상·새 탭·reload, 날짜 경계, 분모 0, 미성숙 window, 중복 전송과 종료 후 늦은 응답을 검증한다. funnel 설정·query·테스트 journey·기대값·실제 결과·환경·시각·dashboard/insight URL을 함께 남긴다.

## Alternatives and Traps

- 표준 `$pageview`와 일반 `follow_succeeded`를 바로 연결하면 실제 표시 전환과 Request 제외를 보장하지 못한다.
- 마지막 선택 하나만 기억하면 다른 대상 선택 뒤 돌아온 이전 대상의 journey를 잘못 합치거나 잃을 수 있다.
- 대상 ID의 hash를 전송하거나 journey를 persistence에 저장하는 방식은 승인된 개인정보·탭 수명 경계에 맞지 않는다.
- 서버 API, DB migration, 범용 analytics 프레임워크, 전역 SDK sanitizer가 필요한 작업은 아니다.

## Risks / Limits

SDK 전송은 best-effort이므로 수집된 데이터의 재현성과 앱 성공 자체를 구분한다. 테스트 endpoint 검증을 실제 PostHog 프로젝트 검증으로 대신하지 않는다. 설정 누락·SDK 예외 시 검색과 Follow UX는 기존대로 동작해야 한다. 잘못된 계측은 이번 custom event 연결을 되돌려 중단할 수 있고, 공통 SDK·Replay 설정과 기존 데이터를 바꾸지 않는다.

## Open Questions

미결 제품 결정은 없다. 실제 dashboard URL, 설치 SDK의 session 갱신 시점, 최종 query와 검증 환경은 구현·검증 단계에서 확인한다. 기존 승인 범위를 바꾸는 새로운 선택이 발견되면 canonical·Linear 경계에서 결정한다.
