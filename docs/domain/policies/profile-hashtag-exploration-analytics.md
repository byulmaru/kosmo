# Profile Hashtag 탐색 지표

## 목적과 근거

공개 Profile의 TagChip에서 시작한 관련 Profile 탐색의 사용률과 결과 선택률을 같은 기준으로 재현한다.
[PROD-556](https://linear.app/byulmaru/issue/PROD-556)의 2026-09-03 지표·session 승인을 따른다.
이 문서는 2026-09-22 현재 Linear 본문과 승인 댓글을 바탕으로 복원했다. 같은 날 사용자가 요청한
Profile Tag 탐색 session 명명과 opaque Hashtag identity 수집 변경을 반영한다.

탐색 기능의 인증, 공개 후보, 정확한 Hashtag identity, 최대 20개 forward pagination과 실패 시 기존 목록
유지는 [ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)과
[탐색 디자인](../../design/hashtag-related-profiles.md)을 따른다. 지표 때문에 탐색 동작을 바꾸지 않는다.

## 집계 대상과 기간

- production Web에서 관측 당시 인증된 Account만 집계한다.
- 한 주는 Asia/Seoul 월요일 00:00 이상부터 다음 월요일 00:00 미만이다. 수신 시각 대신 관측 시각으로
  주차를 정하고 완료된 직전 주를 검토한다.
- WAA는 인증된 화면 조회, Profile 생성·선택 성공, Post 생성 성공, Follow 실행 성공, 검색 제출·결과
  로드·선택 중 하나 이상이 관측된 distinct Account다. PROD-555의 승인된 운영 정의를 이 지표에 적용하며,
  다른 지표의 공통 분모를 새로 정하지 않는다.
- 자동 클릭, Replay, pageleave, performance, feature flag, SDK 진단 이벤트만 있거나 실패 요청만 있는
  Account는 WAA에서 제외한다.
- 익명 관측, development·test, 내부·테스트·알려진 봇·자동화 Account를 제외한다. 여러 session이나 기기를
  사용해도 같은 Account는 해당 주의 WAA와 사용률 분자에 각각 한 번만 센다.
- 집계에는 계산 규칙과 제외 목록의 버전을 표시한다. 실제 Account 제외 목록은 공개 산출물에 넣지 않는다.

## 탐색 session과 결과

- 공개 Profile의 TagChip으로 특정 Hashtag 탐색에 진입하면 session이 시작되고 해당 탐색을 이탈하면 끝난다.
  다른 Hashtag 진입과 Account 전환은 기존 session을 끝낸다. 이전 관측을 다음 session이나 Account로 옮기지 않는다.
- 탐색을 연결하는 무작위 불투명 식별자는 `profile_tag_exploration_session_id`로 부른다. Profile Tag에서
  관련 Profile을 탐색하는 session을 뜻하며, Profile Tag라는 별도 durable 객체나 Hashtag identity를 만들지 않는다.
- 같은 session의 재시도, 추가 로드와 cache·network 재노출은 별도 탐색 session으로 세지 않는다.
- 첫 목록 요청이 성공하고 관련 Profile을 하나 이상 표시하면 `has_results`, 성공했지만 표시할 Profile이
  없으면 `empty`다. 첫 목록 요청 실패나 유효한 Hashtag 목록을 만들지 못한 뒤 이탈할 때까지 성공하지 못하면
  `error`다.
- 첫 오류나 not-found 뒤 같은 session의 재시도가 성공하면 첫 목록 결과는 `has_results` 또는 `empty`다.
  다음 page 오류는 첫 목록 결과를 바꾸지 않고 별도 품질 항목으로 집계한다.
- 같은 session의 cache·network 재노출은 첫 목록 결과를 중복 집계하지 않는다. 첫 결과 전에 오류 없이
  이탈한 session은 Empty·Error 비율의 분모에서 제외한다.
- Profile 결과 item을 선택하면 전환으로 센다. Profile route의 후속 network 실패가 이미 발생한 선택을
  취소하지 않는다. 한 session에서 여러 Profile을 선택해도 전환은 최대 한 번이다.

## 계산식

| 지표                     | 분자                                                         | 분모                          |
| ------------------------ | ------------------------------------------------------------ | ----------------------------- |
| 주간 Hashtag 탐색 사용률 | 첫 목록 결과가 `has_results` 또는 `empty`인 distinct Account | WAA                           |
| 결과 선택률              | Profile을 하나 이상 선택한 `has_results` session             | `has_results` session         |
| Empty 비율               | 첫 목록 결과가 `empty`인 session                             | 첫 목록 결과가 확정된 session |
| Error 비율               | 첫 목록 결과가 `error`인 session                             | 첫 목록 결과가 확정된 session |

각 비율은 분자 / 분모 × 100으로 계산한다. 분모가 0이면 0% 대신 계산할 수 없음으로 표시한다.
첫 목록 결과가 확정된 session은 `has_results`, `empty`, `error` session의 합이다.
Session 지표는 첫 목록 결과가 일어난 주에 귀속한다. 주 경계 뒤 선택이 발생해도 같은 session의 첫 목록
결과 주차에 반영한다. 최종 `error`는 session 종료 주가 아니라 첫 initial 오류가 발생한 주에 귀속한다.
같은 session에서 retry에 성공하면 오류로 세지 않고 성공 결과가 발생한 주에 귀속한다.

## 개인정보와 수집 경계

- 이 지표의 앱 소유 custom event는 `profile_tag_exploration_session_id`, 탐색 대상의 안정적인 opaque
  Hashtag identity인 `hashtag_id`, 결과·요청 단계처럼 계산에 필요한 고정 분류값만 사용한다.
- `hashtag_id`는 TagChip이 이미 확인한 공용 Hashtag identity를 사용한다. 이름이나 이름을 인코딩·해시한
  대체값, 임의 route 입력으로 만들지 않는다. 같은 Hashtag의 여러 session은 같은 identity를 사용하며
  session 식별자와 Hashtag identity를 혼동하지 않는다. 확인된 identity가 없으면 해당 property를 생략하고
  누락 범위를 검증 결과에 남긴다. 이름·URL을 대신 보내거나 기존 전체 오류 집계에서 조용히 제외하지 않는다.
- 이 수집은 Hashtag별 탐색량·도달/사용·결과 선택 전환율·Empty/Error 비율·추세를 이후 분석할 수 있도록
  원천 자료를 보존하기 위해 필요하다. 전체 네 비율 계산만을 위해서는 필요하지 않은 항목임을 구분한다.
  session마다 바뀌는 식별자로는 동일 Hashtag의 여러 탐색을 연결할 수 없으므로 안정적인 identity 하나를
  추가하며, 사람이 읽을 수 있는 주제 이름과 Profile 정보는 복제하지 않는다.
- Opaque identity라고 해서 익명 데이터이거나 민감하지 않은 데이터가 되는 것은 아니다. Hashtag 자료와 연결하면 주제를 알 수 있고,
  Account의 행동과 결합하면 관심 주제를 추론할 수 있다. 2026-09-22 사용자는 이 목적과 최소 범위로
  PROD-556의 Hashtag identity 수집을 명시적으로 요청했다. 다른 identifier의 수집 허용으로 확대하지 않는다.
- raw Hashtag text·Canonical/Display Hashtag Name·검색어·Profile ID·이름·handle·오류 원문·URL·pathname·
  Account ID 중복 property는 추가하지 않는다. 현재 Account 연결은 기존 opaque Account identify/reset 경계를 따른다.
- SDK가 만드는 표준 pageview·pageleave·autocapture와 URL·referrer·session·검색·캠페인 metadata는 유지한다.
  이 지표를 위해 표준 수집을 정제하거나 차단하지 않는다.
- Replay는 이 지표와 별도 책임이다. PROD-795의 Product Analytics 활성화·Replay 비활성화 결정과
  PROD-741의 조건부 재활성화 범위를 따른다. PROD-556은 Replay를 활성화하거나 Cloud 보호 설정을 변경하지 않는다.
- Replay를 사용하는 경우 production canonical origin, 10% sampling, input masking, 30일 retention과
  canonical Post Content의 표준 보호를 유지하는 책임은 상위 작업에 남는다.
- 자유 입력 또는 비공개 콘텐츠로 탐색 범위가 확대되면 배포 전에 상위 개인정보 계약을 다시 검토한다.
- 분석 초기화·식별자 생성·전송 실패는 탐색, 재시도, 추가 로드와 Profile 선택을 막지 않는다.
- SDK의 reset·identify 실패 중 실제 Account 귀속은 정상 전환과 구분해 검증한다. 기존 fail-open을 유지하며
  해당 실패 경로의 귀속을 보장할 수 없다면 그 한계를 명시한다. 별도 identity recovery system이나
  분석 성공을 기다리는 제품 차단을 이 지표의 의무로 삼지 않는다.

## Dashboard와 책임

PROD-556 담당자는 초기 PostHog Insight·dashboard를 만들고 매주 완료된 직전 주의 네 비율을 검토한다.
분자·분모 절대 수, WAA, 관측 기간, 집계 실행 시각, 계산 규칙 버전과 제외 목록 버전을 함께 표시한다.
다음 page 오류는 주 지표와 분리해서 확인하며 production Web 외 플랫폼은 미검증으로 표시한다.

PROD-556은 자신의 지표 계약, 이벤트, 전체 네 비율 dashboard, 합성 자료 대조와 실제 수집 검증을 맡는다.
이번 opaque Hashtag identity의 계측·안정성·원문 비포함·수집 누락 검증도 PROD-556 책임이다.
Hashtag별 breakdown Insight·dashboard까지 이번 전달 범위로 넓힐지는 사용자 결정 대기다.
원천 자료 수집 결정만으로 Hashtag별 지표의 새 계산식·화면·운영 책임을 확정하지 않는다.
PROD-795의 실제 개인정보·운영 통합 결과가 확인되기 전에는 production 수집 인수를 완료로 표시하지 않는다.
이슈 Done만으로 실제 적용과 검증을 대신하지 않는다. PROD-741의 Replay 재활성화·검증과 PROD-575의 전체
제품 분석 인수 책임은 가져오지 않는다.

프로필 태그 도메인·탐색 UX, Post Hashtag 계측, PROD-557의 검색→Profile·Follow 전환과 30분 attribution,
Native SDK, 과거 이벤트와의 호환성은 제외한다.

## 승인 이력

- [2026-09-03 지표·session 승인 복원 기록](../records/2026-09-03-profile-hashtag-exploration-metrics-contract.md)
- PROD-556 승인 댓글 `88fa293a-616e-47d5-81fa-ede269ce3c3a`가 이전 화면 진입 기반 사용률을 대체한다.
- 최신 Replay 책임은 [PROD-741](https://linear.app/byulmaru/issue/PROD-741)의 2026-09-22 범위 결정과
  [PR #955](https://github.com/byulmaru/kosmo/pull/955)의 병합된 결정에 따른다.

- 2026-09-22 정혜주는 첫 오류가 일요일에 발생하고 성공 없이 월요일에 이탈한 session을 첫 오류 발생 주에
  집계하도록 현재 Spec 작업에서 선택했다.
- 2026-09-22 Review Packet 수정 요청은 기존 Hashtag ID 수집 금지를 위 목적의 opaque Hashtag identity
  허용으로 변경했다. raw 이름과 Profile 정보 금지, 표준 SDK 수집·Replay 책임, 기존 네 계산식은 유지한다.
  이 계약 변경 지시는 수정 산출물의 최종 승인이나 구현·배포 승인을 뜻하지 않는다.
