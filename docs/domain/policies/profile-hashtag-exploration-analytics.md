# Profile Hashtag 사용자 Funnel과 최초 결과

## 목적과 권위

[PROD-556](https://linear.app/byulmaru/issue/PROD-556)은 **태그 탐색을 시작한 사용자가 관련 Profile
목록을 보고 Profile 선택까지 이어지는가**를 측정한다. 2026-10-06 리뷰어 제안을 수용한 사용자 결정의
현재 계약(`prod-556-user-funnel-v3`)이다. 이전 session 계약과 v2 화면 진입·요청 품질 계약을 대체한다.

탐색 UX·인증·공개 후보·정확한 Hashtag identity·20개 pagination·실패 시 기존 목록 유지는
[ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)과 [탐색 디자인](../../design/hashtag-related-profiles.md)을 따른다.

## 사용자 Funnel

**TagChip 선택 → 최초 관련 Profile 결과 표시(결과 수 > 0) → Profile 선택**, 사용자 단위 ordered 순서,
conversion window **30분**이다. 최초 단계부터 마지막 단계까지 30분 이내이며, 세 단계의 확인된
Hashtag identity가 같아야 한다. 반복 탐색은 별도 사용자 분모가 아니다. 같은 사용자에게 유효한 같은
Hashtag 경로가 있으면 기간의 전환에 최대 한 번 기여한다. 전체값은 태그별 사용자 합집합이며 태그별
사용자 수를 더하지 않는다. 목록→선택 상대 전환과 클릭→선택 전체 전환은 구분한다.

결과는 cache/network 출처가 아니라 사용자에게 실제로 최초 표시된 첫 페이지다. 결과 수는 첫 페이지의
표시 개수(최대 20)이며 전체 관련 Profile 수나 pagination 누적 수가 아니다. Empty도 결과 표시다.
loading/skeleton·error·notFound는 결과가 아니다. 실패 후 재시도로 처음 결과가 표시되면 관측한다.
같은 결과 화면에서 background 갱신·pagination·재시도는 최초 관측을 덮어쓰거나 다시 기록하지 않는다.
최초 결과가 Empty이면 이후 목록이 나타나도 그 관측은 Empty로 남고 목록 도달 단계로 바뀌지 않는다.
Profile 선택은 실제 목록 item navigation 선택이며 도착 Profile query 실패가 선택을 취소하지 않는다.
직접 URL 진입은 결과 관측에 포함되지만 앞선 TagChip 선택 없이 Funnel 시작을 합성하지 않는다.
새 탭 TagChip 클릭은 source tab에서 기록하고 기존 Account identity로 연결한다.

## Empty 비율과 기간

Empty 비율은 **최초 결과 표시 중 결과 수 0인 횟수 / 전체 최초 결과 표시 횟수**다. 로딩 중 이탈·결과를
표시하지 못한 실패·notFound는 분모에서 제외한다. 사용자 Funnel의 distinct 사용자 분모와 구분한다.
분모 0은 계산할 수 없음이며 0%로 표시하지 않는다. 결과 수 0보다 큰 관측만 Funnel 목록 도달에 기여한다.
요청별 success/partial/failure 이벤트와 실패율 집계는 이번 범위에서 제거하고 오류 진단은 기존 Sentry
경로에 맡긴다. 화면 진입 이벤트·진입 시각·탐색 session correlation도 사용하지 않는다.

Production Web의 관측 당시 인증 Account만 집계한다. development/test, 내부·테스트·알려진 봇·자동화
Account는 기존 제외 규칙을 적용하고 Account identify/reset을 사용한다. 계측은 best-effort·fail-open이다.
한 주는 Asia/Seoul 월요일 00:00부터 다음 월요일 미만이다. Funnel은 시작 step 주, Empty는 최초 결과
표시 주에 귀속한다. 주 말 30분의 전환을 관측한 뒤 완료된 직전 주를 검토한다. 진행 중 주는 잠정이다.
기간·timezone·분자/분모 절대 수·계산/제외 버전·실행 시각·수집 누락을 표시한다.

Hashtag별 native Funnel은 `hashtag_id` event breakdown과 `all_events` attribution으로 모든 step의
태그 일치를 요구한다. 전체값도 같은 태그 경로만 연결하며 단순 first-touch 또는 태그 조건을 잃은
전체 Funnel로 대체하지 않는다.

## 이전 계약 폐기와 운영 인수

v2의 전체 화면 진입 기반 Empty, 이후 최초 nonempty 별도 관측, 요청별 품질·실패율은 폐기한다.
이전 session 선택률·종료 기반 Final Error도 폐기 상태를 유지한다. 이전 수치와 연속 비교하지 않는다.
Dashboard 2122242와 저장 Insight를 사용자 Funnel·Hashtag별 단계/주간 추세·결과 표시 기반 Empty로
맞춘다. 반복 시도·태그 혼합·Empty 후 목록·30분 초과·주 경계의 합성 계산과 실제 렌더를 검증한다.
정의 read-back·합성 검증은 실제 production payload/수집률/운영 제외 인수가 아니다. PROD-795의 운영
증거와 production 수집 인수 전에는 acceptance를 완료하지 않는다. merge·배포·Linear Done은 별도다.

## 이벤트와 최소 property

| 이벤트                             | 발생 경계                                | 앱 소유 property                                   |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `profile_hashtag_clicked`          | 실제 TagChip navigation 선택(새 탭 포함) | `hashtag_id`                                       |
| `profile_hashtag_list_viewed`      | 최초 실제 결과 표시(Empty 포함)          | `hashtag_id`, `result_count`(첫 페이지 개수, 0~20) |
| `profile_hashtag_profile_selected` | 목록 item의 실제 선택                    | `hashtag_id`                                       |

`result_count` 없는 과거 목록 이벤트는 v3 목록/Empty 집계에서 제외한다. 결과 표시의 중복 방지는
해당 결과 화면의 최초 관측에 한정하고 공통 셸·인증 수명주기에서 화면 진입을 관리하지 않는다.

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
