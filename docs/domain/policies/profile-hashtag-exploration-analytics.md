# Profile Hashtag 사용자 전환과 품질 지표

## 목적과 권위

[PROD-556](https://linear.app/byulmaru/issue/PROD-556)은 **태그 탐색을 시작한 사용자가 관련 Profile
목록을 보고 Profile 선택까지 이어지는가**를 측정한다. 2026-10-03 정혜주의 리뷰 대응 결정을 반영한
현재 계약(`prod-556-user-funnel-v2`)이다. [2026-09-03 승인 기록](../records/2026-09-03-profile-hashtag-exploration-metrics-contract.md)의
탐색 session 계약은 역사적 기록이며 아래 계약으로 대체됐다.

인증·공개 후보·정확한 Hashtag identity·20개 forward pagination·오류 시 기존 목록 유지와 UX는
[ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)과 [탐색 디자인](../../design/hashtag-related-profiles.md)을 따른다.
계측은 기존 탐색 UX를 바꾸지 않는다.

## 세 분석 단위

| 지표                    | 단위                  | 분자 / 분모                                                          |
| ----------------------- | --------------------- | -------------------------------------------------------------------- |
| 사용자 Funnel 전체 전환 | distinct 인증 Account | 30분 안에 같은 Hashtag로 3단계를 완료한 사용자 / TagChip 선택 사용자 |
| 사용자 Funnel 목록 도달 | distinct 인증 Account | 30분 안에 같은 Hashtag 목록을 본 사용자 / TagChip 선택 사용자        |
| 최초 Empty 경험 비율    | 화면 진입             | 최초 meaningful state가 Empty인 진입 / 전체 태그 탐색 화면 진입      |
| 요청 완전 실패율        | 실제 완료 요청        | `failure` 요청 / `success + partial + failure` 요청                  |
| 부분 응답 비율          | 실제 완료 요청        | `partial` 요청 / `success + partial + failure` 요청                  |

각 비율은 분자/분모 × 100이며 분모 0은 계산할 수 없음이다. Funnel 분모에 WAA나 탐색 session 수를
사용하지 않는다. PROD-555의 WAA 정의를 바꾸지 않는다.

### 사용자 Funnel

**TagChip 선택 → 관련 Profile 목록 표시 → Profile 선택**, ordered 순서, conversion window **30분**이다.
다른 event가 중간에 있어도 된다. 최초 단계부터 마지막 단계까지 30분 이내여야 한다.
동일 사용자의 여러 탐색 시도를 별도 Funnel 분모로 세지 않는다. 한 사용자의 여러 시도 중 유효한
같은 Hashtag 경로가 있으면 해당 기간 사용자 전환에 최대 한 번 기여한다. 탐색별 최종 outcome은 없다.
Profile 선택은 관련 목록 item의 실제 navigation 선택이며 도착 Profile query 실패가 선택을 취소하지 않는다.
직접 URL 진입은 화면 진입·목록 관측에는 포함되지만 앞선 TagChip 선택 없이 Funnel 시작으로 합성하지 않는다.
새 탭의 실제 TagChip 클릭도 source tab에서 기록하고 기존 Account identity로 연결한다.

목록 표시는 cache/network 출처가 아니라 **사용자에게 실제로 표시된 nonempty 목록**이다. commit되지
않은 render나 background 데이터 갱신은 표시가 아니다. 같은 화면 진입에서 최초 nonempty 목록 표시만
기록하되 Empty를 먼저 봤어도 이후 목록 step과 Profile 선택을 기록할 수 있다.

### 화면 진입과 최초 Empty

화면 진입은 다른 화면에서 태그 탐색 화면으로 이동하거나 다른 Hashtag 화면으로 이동한 경우다.
새 탭·새 문서의 직접 진입도 포함한다. 같은 화면의 재시도·background 갱신·actor remount·일시적인
Account 조회 loading은 새 진입이 아니다. 화면 이탈 후 돌아오면 새 진입이다. 새로운 인증 Account의
관측은 이전 Account의 진입과 분리한다. 이 단위는 탐색 session이나 Funnel correlation이 아니다.

분모는 **전체 화면 진입**으로, 로딩 중 이탈·요청 실패·notFound 등 의미 있는 결과를 끝내 표시하지 못한
진입도 포함한다. 최초로 실제 표시한 meaningful state는 `has_results` 또는 `empty`다.
**loading/skeleton, error, notFound는 meaningful result state가 아니다.** 재시도 뒤 처음 목록/Empty가
표시되면 그것을 최초 상태로 기록한다. 최초 Empty 이후 목록이 표시돼도 최초 Empty 경험은 유지되고
Funnel 진행을 막지 않는다. 진입 시각으로 Empty 분자와 전체 진입 분모의 주차를 맞춘다.

### 요청 품질

초기 요청, background 재검증, pagination, retry의 **실제 network 요청 완료**를 각각 센다. cache snapshot은
network 요청이 아니다. retry 성공이 이전 실패를 지우지 않는다. 화면 이탈을 기다리거나 최종 Error로
확정하지 않는다. 요청 오류는 Funnel outcome이 아니며 Funnel 성공을 덮어쓰지 않는다.

- `success`: 오류 없는 유효한 GraphQL 응답. 정상 Empty와 오류 없는 `node: null`(notFound)도 요청 성공이다.
- `partial`: GraphQL `errors`와 사용 가능한 관련 Profile connection(Empty 포함)이 함께 반환된다.
- `failure`: transport/HTTP/JSON 실패 또는 GraphQL 오류로 사용 가능한 관련 목록 결과를 제공하지 못한다.
  `data: null`, 오류 때문에 `node`/connection이 null로 전파된 경우를 포함한다.

`partial`은 별도 분류하고 완전 실패율 분자에는 넣지 않는다. 요청 단계 `initial / pagination`은 구분한다.
늦은 이전 Account 요청을 현재 Account에 귀속하지 않는다. analytics가 실패하거나 요청 당시 인증 identity를
확인할 수 없으면 best-effort 누락으로 보고하고 제품 흐름은 유지한다.

## 이벤트와 property

새 이벤트만 v2 분석에 사용하며 과거 session 이벤트와 합쳐 계산하지 않는다.

| 이벤트                                 | 발생 경계                                    | 앱 소유 property                                                         |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `profile_hashtag_clicked`              | 실제 TagChip navigation 선택(새 탭 포함)     | `hashtag_id`                                                             |
| `profile_hashtag_screen_entered`       | 인증된 태그 탐색 화면 진입 1회               | 없음                                                                     |
| `profile_hashtag_initial_state_viewed` | 해당 진입의 최초 표시된 meaningful state 1회 | `hashtag_id`, `result: has_results / empty`, `entered_at`(ISO 진입 시각) |
| `profile_hashtag_list_viewed`          | 해당 진입의 최초 nonempty 목록 표시          | `hashtag_id`                                                             |
| `profile_hashtag_profile_selected`     | 관련 목록 item의 실제 선택                   | `hashtag_id`                                                             |
| `profile_hashtag_request_completed`    | 해당 목록의 실제 요청 완료마다               | `stage: initial / pagination`, `result: success / partial / failure`     |

`entered_at`은 Empty의 진입 주차 귀속용이며 correlation/session ID가 아니다. 전체 진입은 실패 전에도
세므로 확인되지 않은 route 입력을 Hashtag property로 보내지 않는다. Hashtag별 Funnel·목록 사용자 수와
최초 Empty 관측 건수는 확인된 `hashtag_id`로 제공한다. 전체 화면 진입 기반 Empty 비율과 전체 요청
품질은 별도 tile로 제공하며 Hashtag별 사용자 Funnel 분모를 품질 지표 분모로 재사용하지 않는다.

## Hashtag 연결과 집계 기간

Funnel 세 step의 `hashtag_id`는 **동일한 확인된 GraphQL Hashtag ID**여야 한다. 사용자 identity만 맞는
A의 클릭 → B의 목록/선택은 A나 전체 전환이 아니다. PostHog event breakdown은 `hashtag_id`, attribution은
`all_events`로 설정해 모든 step의 값 일치를 요구한다. 단순 first-touch breakdown은 충분하지 않다.
전체 사용자 값은 유효한 동일 Hashtag 경로들의 **사용자 합집합**이며 Hashtag별 사용자 수를 더하지 않는다.
합계에서 동일 Hashtag 조건을 잃는 쿼리도 사용하지 않는다. 목록→선택 상대 전환과 클릭→선택 전체
전환을 별도 이름으로 표시한다. 기존 탐색별 선택률 이름을 사용자 전환에 재사용하지 않는다.

Production Web의 관측 당시 인증 Account만 집계한다. development/test, 내부·테스트·알려진 봇·자동화
Account는 기존 운영 제외 규칙을 적용한다. 식별은 기존 Account identify/reset을 사용한다.
한 주는 Asia/Seoul 월요일 00:00 이상부터 다음 월요일 미만이며 수신 시각이 아닌 관측 시각을 쓴다.
Funnel은 시작 step 주, Empty는 진입 주, 요청 품질은 요청 완료 주다. 주 말 30분 안의 Funnel 완료를
관측할 여유를 두고 완료된 직전 주를 검토한다. Hashtag별 사용자 수의 합·비율의 평균을 전체값으로 삼지 않는다.
기간·timezone·분자/분모 절대 수·계산 규칙/제외 버전·실행 시각·수집 누락을 표시한다.

## 이전 계약 폐기와 운영 인수

`profile_tag_exploration_session_id`, 탐색별 결과 선택률, 확정 session 분모의 Empty/Error 비율,
초기 오류→retry→성공 없이 탐색 종료 기반 **Final Error**, 탐색 session 수와 종료 주차 규칙은 폐기한다.
기존 다섯 session 이벤트도 더 이상 발행하지 않는다. 새 사용자 Funnel/화면 진입 Empty/요청 품질과
같은 지표로 해석하거나 과거 수치를 이어 붙이지 않는다. Dashboard 이름·설명에도 v2와 단절을 명시한다.

PROD-556 담당자는 Dashboard `2122242`의 저장 Insight를 새 계약으로 교체하고 주간 사용자 Funnel,
Hashtag별 Funnel 및 Empty·요청 품질을 함께 검토한다. 반복 시도·태그 간 step 혼합·Empty→목록·background
failure·partial·주 경계의 합성 자료를 실제 query 및 저장 Insight/dashboard에서 재현해 기대값과 대조한다.
정의 read-back, 합성 검증, 실제 production 수집 인수를 구분한다. 이벤트 없는 기간은 0% 성공/실패로
표시하지 않는다. PROD-795의 개인정보·운영 통합 실제 증거와 production payload/비율 검증 전에는
production acceptance를 완료로 표시하지 않는다. PR merge·배포·Linear Done도 별도다.

## 개인정보와 제외 범위

앱 custom property는 위 최소 allowlist만 사용한다. `hashtag_id`는 TagChip/목록이 받은 opaque Hashtag
identity이며 이름·slug·URL·이름의 encoding/hash·임의 route 입력을 대체값으로 보내지 않는다. raw Hashtag
text/name·검색어·Profile ID/name/handle·오류 원문·URL/pathname·Account ID 중복 property는 추가하지 않는다.
opaque identity가 익명을 보장하지 않는다는 기존 수집 목적과 한계는 유지한다.

SDK 표준 pageview/pageleave/autocapture, URL/referrer/session/검색/캠페인 metadata와 fail-open을 유지한다.
Replay는 PROD-741과 PROD-795 책임이며 PROD-556은 활성화·Cloud 보호 설정을 바꾸지 않는다. 기존
canonical origin·sampling·input masking·retention·Post Content 보호의 상위 책임을 유지한다.
Post Hashtag, TagChip impression/도달률, 검색→Profile/Follow(PROD-557), Native SDK와 과거 이벤트
호환성은 제외한다. OpenSpec은 짧은 작업·검증 메모이며 제품 요구사항의 authority가 아니다.
