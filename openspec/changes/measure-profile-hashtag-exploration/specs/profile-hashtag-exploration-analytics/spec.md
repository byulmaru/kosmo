## ADDED Requirements

### Requirement: 승인된 주간 사용률

시스템은 첫 목록 조회에 성공한 distinct Account / WAA로 주간 사용률을 계산해야 한다(MUST).

**Source Context:** PROD-556의 2026-09-03 최종 승인과 `docs/domain/policies/profile-hashtag-exploration-analytics.md`.

#### Scenario: 같은 Account의 여러 탐색

- **WHEN** 한 Account가 같은 주 여러 기기·session에서 `has_results`와 `empty`를 관측한다
- **THEN** 사용률 분자와 WAA에 각각 최대 한 번 포함한다

#### Scenario: 활동과 제외 집합

- **WHEN** production Web의 인증 활동과 익명·개발·내부·테스트·봇·자동화 관측을 함께 집계한다
- **THEN** 승인된 WAA 활동이 있는 인증 Account만 포함하고 제외 집합을 적용한다
- **AND** 자동 클릭·Replay·pageleave·performance·feature flag·SDK 진단 또는 실패 요청만으로 WAA가 되지 않는다

#### Scenario: 성공 없는 탐색

- **WHEN** Account에게 첫 목록 성공은 없고 오류만 발생한다
- **THEN** 탐색 사용률 분자에 넣지 않는다

### Requirement: 탐색 session의 경계

시스템은 Profile Tag의 TagChip에서 특정 Hashtag의 관련 Profile 탐색에 진입한 때부터 이탈까지를 `profile_tag_exploration_session_id`로 연결하는 하나의 session으로 관측해야 한다(MUST).

**Source Context:** PROD-556의 session 승인, 2026-09-22 사용자의 session 명명 요청과 canonical의 탐색 session과 결과.

#### Scenario: retry와 추가 로드

- **WHEN** 같은 Hashtag 탐색에서 retry·추가 로드·cache 재노출이 발생한다
- **THEN** 기존 session을 유지한다

#### Scenario: 이탈과 다른 Hashtag

- **WHEN** 탐색을 이탈하거나 다른 Hashtag에 진입한다
- **THEN** 기존 session을 끝내고 새 TagChip 진입은 새 session으로 관측한다

#### Scenario: Account 전환과 늦은 응답

- **WHEN** Account A의 요청 중 Account B로 전환한 뒤 A의 응답이 도착한다
- **THEN** A session을 끝내고 A의 관측을 B에게 귀속시키지 않는다

### Requirement: 첫 목록 결과와 재시도

시스템은 첫 목록 결과를 `has_results | empty | error`로 구분하고 같은 session의 retry 성공을 오류보다 우선해야 한다(MUST).

**Source Context:** PROD-556의 계산과 운영 규칙, canonical의 탐색 session과 결과.

#### Scenario: 결과 있음과 없음

- **WHEN** 첫 목록 요청이 성공한다
- **THEN** 표시할 Profile이 있으면 `has_results`, 없으면 `empty`로 한 번 집계한다

#### Scenario: 오류 뒤 회복

- **WHEN** initial 오류 또는 not-found 뒤 같은 session에서 retry가 성공한다
- **THEN** 성공 결과로 집계하고 최종 `error`로 세지 않는다

#### Scenario: 회복하지 못한 오류

- **WHEN** 첫 목록을 만들지 못한 뒤 session을 이탈할 때까지 성공하지 못한다
- **THEN** 첫 목록 결과를 `error`로 집계한다

#### Scenario: 결과 전에 이탈

- **WHEN** 첫 결과와 오류가 발생하기 전에 session을 이탈한다
- **THEN** Empty·Error 비율의 확정 결과 분모에서 제외한다

#### Scenario: cache와 pagination

- **WHEN** 같은 목록의 cache·network 재노출 또는 pagination 성공·오류가 발생한다
- **THEN** 첫 목록 결과를 중복 집계하거나 pagination 결과로 바꾸지 않는다
- **AND** pagination 오류는 별도 품질 항목으로 확인한다

### Requirement: 결과 선택률

시스템은 Profile을 하나 이상 선택한 `has_results` session / 전체 `has_results` session으로 결과 선택률을 계산해야 한다(MUST).

**Source Context:** PROD-556의 결과 선택률·중복 승인과 canonical의 계산식.

#### Scenario: 여러 선택과 후속 실패

- **WHEN** 같은 session에서 여러 Profile을 선택하고 Profile route의 후속 요청이 실패한다
- **THEN** 선택 전환은 최대 한 번 유지되며 후속 실패 때문에 취소되지 않는다

#### Scenario: 결과가 없는 session

- **WHEN** 첫 목록 결과가 `empty` 또는 `error`다
- **THEN** 결과 선택률의 `has_results` 분모에 넣지 않는다

### Requirement: 주차와 Empty·Error 비율

시스템은 Asia/Seoul 주차, 확정된 첫 결과의 공통 분모와 분모 0 표시 규칙을 적용해야 한다(MUST).

**Source Context:** PROD-556의 계산과 운영 규칙, canonical의 집계 대상과 기간·계산식, 2026-09-22 사용자의 첫 오류 발생 주 선택.

#### Scenario: 주 경계를 넘는 선택

- **WHEN** 첫 목록 결과는 일요일에 발생하고 같은 session의 선택은 다음 월요일에 발생한다
- **THEN** 선택은 첫 목록 결과의 주차에 귀속한다

#### Scenario: 주 경계를 넘는 최종 오류

- **WHEN** 일요일에 첫 initial 오류가 발생한 뒤 성공하지 못하고 월요일에 탐색을 이탈한다
- **THEN** 최종 `error`는 첫 오류가 발생한 주에 귀속한다

#### Scenario: 주 경계를 넘는 retry 성공

- **WHEN** 일요일에 첫 initial 오류가 발생한 뒤 같은 session에서 월요일 retry가 성공한다
- **THEN** 오류 대신 `has_results` 또는 `empty`로 분류하고 월요일의 성공 결과가 발생한 주에 귀속한다

#### Scenario: 공통 분모

- **WHEN** `has_results`, `empty`, `error` session을 집계한다
- **THEN** 세 결과의 합을 Empty·Error의 분모로 쓰고 각 결과 수를 각 비율의 분자로 쓴다

#### Scenario: 관측 주와 분모 0

- **WHEN** 완료된 직전 주를 집계하거나 비율의 분모가 0이다
- **THEN** Asia/Seoul 월요일 00:00 이상 다음 월요일 00:00 미만을 사용하고 분모 0은 계산할 수 없음으로 표시한다

### Requirement: 개인정보와 공용 수집 경계

시스템은 custom event의 최소 식별·분류 범위와 기존 SDK·Replay 책임 경계를 유지해야 한다(MUST).

**Source Context:** 2026-09-22 사용자의 session 명명·opaque Hashtag identity 수집 변경, canonical의 개인정보와 수집 경계, PR #955와 PROD-741의 최신 Replay 결정.

#### Scenario: custom payload

- **WHEN** Hashtag 탐색 custom event를 보낸다
- **THEN** `profile_tag_exploration_session_id`, 확인된 GraphQL Hashtag Node ID인 `hashtag_id`와 필요한 고정 분류값만 추가한다
- **AND** raw Hashtag text·Canonical/Display Hashtag Name·검색어·Profile ID·이름·handle·오류 원문·URL·pathname·Account ID 중복 property를 넣지 않는다

#### Scenario: 안정적인 Hashtag identity

- **WHEN** 같은 Hashtag를 여러 Account·session에서 탐색하고 retry·pagination·선택·종료를 관측한다
- **THEN** 각 session의 `profile_tag_exploration_session_id`는 분리하되 같은 `hashtag_id`를 유지한다
- **AND** 다른 Hashtag는 다른 `hashtag_id`를 사용하며 이름·slug·URL·이름의 인코딩 또는 hash로 대체하지 않는다

#### Scenario: 확인된 identity의 not-found

- **WHEN** 확인된 Hashtag Node ID로 TagChip 탐색에 진입한 뒤 not-found가 발생한다
- **THEN** 진입 때 확인한 같은 `hashtag_id`를 유지한다

#### Scenario: 확인되지 않은 identity

- **WHEN** 탐색 관측에 연결할 확인된 Hashtag Node ID가 없다
- **THEN** `hashtag_id`를 생략하고 원문·임의 route 입력을 대신 보내지 않으며 수집 누락을 검증 결과에 남긴다
- **AND** ID 누락만으로 해당 session을 기존 전체 오류 집계에서 제외하지 않는다

#### Scenario: 표준 metadata와 Replay

- **WHEN** 이 지표를 활성화한다
- **THEN** 표준 pageview·pageleave·autocapture와 URL·referrer·session·검색·캠페인 metadata를 앱 필터로 지우지 않는다
- **AND** PROD-556 때문에 Replay를 재활성화하거나 Cloud 보호 설정을 변경하지 않는다

### Requirement: 탐색 동작과 장애 격리

시스템은 기존 탐색 계약을 유지하고 분석 실패가 제품 동작을 방해하지 않도록 해야 한다(MUST).

**Source Context:** PROD-556의 완료 조건, ADR 0021과 탐색 디자인, 2026-09-22 사용자의 식별 실패 검증·fail-open 유지 요청.

#### Scenario: 분석 실패

- **WHEN** 분석 초기화·session ID 생성·event 전송이 실패한다
- **THEN** 탐색·retry·추가 로드·Profile 선택이 계속 동작한다

#### Scenario: Account 전환 중 reset 실패

- **WHEN** mock/stub에서 A→B 전환의 reset이 상태 변경 전에 throw하고 새 탐색 capture가 호출된다
- **THEN** capture 당시 SDK distinct identity와 `$user_id`를 테스트 관측값으로 확인하고 A 식별자가 남는 귀속 한계를 기록한다
- **AND** 기존 fail-open과 제품 동작을 유지하며 B 귀속 보장이나 production 검증 성공으로 보고하지 않는다

#### Scenario: Account 전환 중 identify 실패

- **WHEN** mock/stub에서 A→B 전환의 reset은 성공하고 identify가 throw한 뒤 탐색 capture가 호출된다
- **THEN** capture 당시 익명 identity와 인증 WAA 판정의 한계를 기록한다
- **AND** 이후 기존 identify 호출이 성공하면 이후 capture의 B 귀속을 대조하고 실패 중 event의 소급 교정을 추정하지 않는다
- **AND** 별도 identity recovery system이나 분석 성공을 기다리는 제품 차단을 추가하지 않는다

#### Scenario: 기존 탐색 경계

- **WHEN** 인증된 Account가 TagChip을 통해 탐색하고 다음 page 요청이 실패한다
- **THEN** 정확한 Hashtag identity·공개 후보·최대 20개 forward pagination과 기존 목록 유지 계약을 보존한다

### Requirement: Hashtag별 탐색 성과 breakdown

시스템은 기존 session/result/주차/제외 규칙을 `hashtag_id`에 적용한 다섯 탐색 성과 지표와 주간 추세를 제공해야 한다(MUST).

**Source Context:** 2026-09-22 사용자의 Hashtag별 Insight 포함 결정, canonical의 Hashtag별 탐색 성과 breakdown.

#### Scenario: Hashtag별 Account와 session 수

- **WHEN** 같은 Hashtag와 주차의 탐색 결과를 집계한다
- **THEN** distinct 탐색 Account 수는 첫 목록 결과가 `has_results` 또는 `empty`인 Account 수이며 탐색 session 수는 `has_results`, `empty`, `error`의 확정 session 합이다
- **AND** 같은 Account의 여러 기기·session은 Account 수에서 한 번만 세고 오류만 있는 Account와 미확정 session을 각각 성공 Account 수와 확정 session 수에 넣지 않는다

#### Scenario: Hashtag별 비율과 주간 추세

- **WHEN** Hashtag별 선택률·Empty 비율·Error 비율을 주별로 계산한다
- **THEN** 선택한 `has_results` session / `has_results` session, `empty` / 확정 session, `error` / 확정 session에 각각 100을 곱한다
- **AND** Asia/Seoul 주차·인증·제외·중복·retry 성공 우선·첫 오류 주·주 경계 뒤 선택 귀속을 전체 지표와 동일하게 적용한다
- **AND** 다섯 지표의 주간 추세를 제공하며 각 비율의 분모가 0이면 계산할 수 없음으로 표시한다

#### Scenario: 여러 Hashtag와 전체 지표

- **WHEN** 같은 Account가 같은 주 여러 Hashtag의 첫 목록 조회에 성공한다
- **THEN** 각 Hashtag에서 한 번씩 세되 전체 distinct Account는 기존대로 한 번만 센다
- **AND** Hashtag별 Account 수 합이나 비율의 단순 평균으로 전체 지표를 대체하지 않는다

#### Scenario: ID가 없는 관측

- **WHEN** 기존 집계 대상인 session에 확인된 `hashtag_id`가 없다
- **THEN** 특정 Hashtag로 추정 배정하지 않고 누락 범위를 별도로 표시하되 전체 집계는 기존 규칙을 유지한다

#### Scenario: 실제 breakdown acceptance

- **WHEN** Hashtag별 Insight·dashboard 구현의 완료를 판단한다
- **THEN** 여러 synthetic Hashtag ID와 주차의 합성 자료를 실제 PostHog query·저장 Insight·dashboard로 집계하고 다섯 지표·분자/분모·주간 추세가 기대값과 일치하는지 확인한다
- **AND** ID 누락·분모 0·여러 Hashtag를 탐색한 Account·주 경계 실패와 성공을 대조한다
- **AND** payload에 ID가 있는 것만으로 완료 처리하지 않으며 raw Hashtag text/name이나 이름용 property를 추가하지 않는다

#### Scenario: 새 도달률과 impression 제외

- **WHEN** Hashtag별 탐색 성과를 전달한다
- **THEN** 별도 Hashtag 도달률, TagChip impression과 이를 분모로 한 노출→탐색 funnel을 정의하거나 계측하지 않는다
- **AND** 새로운 계측이 필요하면 후속 후보로 기록하고 PROD-556 완료 범위에 임의로 추가하지 않는다

### Requirement: 지표 전달과 운영 검증

시스템은 초기 PostHog Insight·dashboard에서 전체 네 비율과 Hashtag별 다섯 지표·주간 추세 및 집계 근거를 재현할 수 있어야 한다(MUST).

**Source Context:** PROD-556의 Dashboard와 책임·완료 조건, 2026-09-22 사용자의 breakdown 포함 결정, canonical의 Dashboard와 책임.

#### Scenario: 주간 검토

- **WHEN** 담당자가 완료된 직전 주를 검토한다
- **THEN** 전체 네 비율과 Hashtag별 다섯 지표·주간 추세, 분자·분모 절대 수, WAA, 관측 기간, 집계 실행 시각, 계산 규칙·제외 목록 버전과 pagination 오류를 확인할 수 있다
- **AND** production Web 외 플랫폼은 미검증으로 표시한다

#### Scenario: 검증과 인수

- **WHEN** 구현 결과의 완료를 판단한다
- **THEN** 합성 자료의 기대값과 실제 집계를 대조하고 PROD-795의 실제 선행 증거를 확인한 뒤 production 수집 인수를 마친다
- **AND** opaque Hashtag identity의 안정성·원문 비포함·수집 누락과 실제 Hashtag별 Insight·dashboard 재현을 PROD-556에서 검증한다
- **AND** PROD-741과 PROD-575의 책임을 이 이슈의 완료로 대신하지 않는다
