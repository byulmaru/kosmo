## ADDED Requirements

### Requirement: production Web 주간 관측 경계

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 멀티 Profile 지표는 production Web에서 행동 발생 시점에 인증된 Account의 관측만 사용해야 한다(MUST). 한 주는 Asia/Seoul 월요일 00:00 이상부터 다음 월요일 00:00 미만이어야 하며(MUST), 수신 시각이 아니라 행동 발생 시각으로 주차를 정해야 한다(MUST).

#### Scenario: 주간 경계에서 행동이 발생한다

- **WHEN** 같은 Account의 관측이 월요일 00:00 직전과 정각에 각각 발생한다
- **THEN** 직전 관측은 앞 주에, 정각 관측은 새 주에 포함한다

#### Scenario: 관측이 늦게 수신된다

- **WHEN** 일요일에 발생한 관측을 다음 월요일에 수신한다
- **THEN** 관측은 일요일이 속한 주에 포함되고 완료 주 수치는 다시 계산될 수 있다

#### Scenario: 익명 방문 뒤 로그인한다

- **WHEN** 익명 상태의 관측 뒤 같은 브라우저에서 Account 로그인이 완료된다
- **THEN** 로그인 전에 발생한 관측을 인증 Account 활동으로 소급하지 않는다

#### Scenario: 여러 Session과 기기를 사용한다

- **WHEN** 같은 Account가 한 주에 여러 Session과 기기에서 포함 대상 행동을 한다
- **THEN** Account 수는 그 주에 한 번만 센다

### Requirement: 주간 활성 Account 집합

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 주간 활성 Account(WAA)는 인증된 화면 조회, Profile 생성 성공, Profile 선택 성공, Post 생성 성공, Follow 실행 성공, 검색 제출·결과 로드·결과 선택 중 하나 이상이 관측된 distinct Account여야 한다(MUST). 자동 클릭 수집, Session Replay, pageleave, performance, feature flag와 SDK 진단 이벤트만으로는 WAA에 넣지 않아야 한다(MUST NOT).

#### Scenario: 선택 Profile 없이 화면을 본다

- **WHEN** 인증된 Account가 선택 Profile 없이 화면을 조회한다
- **THEN** Account는 WAA에 포함된다
- **AND** 사용 Profile 수는 추정하지 않는다

#### Scenario: 실패한 요청만 있다

- **WHEN** 한 주 동안 실패하거나 취소된 요청만 있고 포함 대상 관측은 없다
- **THEN** Account는 WAA에 포함되지 않는다

#### Scenario: SDK 자동 관측만 있다

- **WHEN** Account에 자동 클릭, Replay, pageleave, performance, feature flag 또는 SDK 진단 관측만 있다
- **THEN** Account는 WAA에 포함되지 않는다

### Requirement: 멀티 Profile 자격과 화면 사용 관측

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 인증된 화면 조회 관측은 해당 시점의 선택 Profile이 있으면 그 opaque ID를 담고, Account가 서로 다른 사용 가능 Profile 2개 이상을 동시에 가졌는지도 담아야 한다(MUST). 사용 가능 Profile은 Account-Profile Membership이 있고 selected Profile 조회 가능 조건을 충족해야 하며(MUST), Local·Remote와 Owner·Member를 임의로 제외하지 않아야 한다(MUST NOT). 이름, handle, Profile 표시 속성과 화면 경로 원문은 앱 소유 지표 속성에 추가하지 않아야 한다(MUST NOT).

#### Scenario: 사용 가능한 Profile이 두 개다

- **WHEN** 인증 화면 조회 시 Account가 Membership과 조회 가능 조건을 충족하는 Profile 2개를 동시에 가진다
- **THEN** 관측은 멀티 Profile 자격이 있음을 나타낸다
- **AND** 선택 Profile이 있으면 그 opaque Profile ID를 사용 관측으로 남긴다

#### Scenario: 서로 다른 시점에 하나씩만 사용할 수 있다

- **WHEN** 한 주 동안 Profile 두 개와 차례로 Membership이 있었지만 어느 시점에도 둘을 동시에 사용할 수 없었다
- **THEN** 두 상태를 합쳐 멀티 Profile 자격을 만들지 않는다

#### Scenario: 선택 Profile이 없다

- **WHEN** Account는 멀티 Profile 자격이 있지만 화면 조회 시 선택 Profile이 없다
- **THEN** 자격과 WAA 관측은 남긴다
- **AND** 사용 Profile ID를 임의로 채우지 않는다

### Requirement: 사용 Profile과 멀티 Profile 활성 Account

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — Account의 사용 Profile은 인증 화면 조회 시 선택 Profile, 선택 성공 Profile, Post 생성 성공 또는 Follow 실행 성공의 행동 주체 Profile로만 계산해야 한다(MUST). 같은 Account·Profile 조합은 한 주에 한 번만 세야 하며 (MUST), 멀티 Profile 활성 Account는 멀티 Profile 대상 WAA이면서 한 주에 서로 다른 Profile 2개 이상을 사용한 Account여야 한다(MUST).

#### Scenario: 생성만 성공한다

- **WHEN** 새 Profile 생성은 성공했지만 선택, 화면 조회와 핵심 행동 관측이 없다
- **THEN** 생성 횟수는 증가한다
- **AND** 새 Profile은 사용 Profile 수에 포함되지 않는다

#### Scenario: 여러 기기에서 두 Profile을 사용한다

- **WHEN** 같은 Account가 서로 다른 기기에서 Profile A와 Profile B를 각각 사용하고 그 주에 멀티 Profile 자격도 확인된다
- **THEN** 사용 Profile 수는 2이고 Account는 멀티 Profile 활성 Account다
- **AND** 직접 전환이 없었다면 전환 횟수는 0이다

#### Scenario: 다른 Account가 같은 Profile을 쓴다

- **WHEN** Account A와 B가 같은 Profile을 사용한다
- **THEN** 각 Account 안에서 Profile 사용 여부를 따로 계산한다
- **AND** 다른 Account의 사용을 가져와 서로 다른 Profile 2개 조건을 채우지 않는다

### Requirement: 활성 사용률과 도달률

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 주 지표인 멀티 Profile 활성 사용률은 멀티 Profile 활성 Account 수를 멀티 Profile 대상 WAA 수로 나눠 계산해야 한다(MUST). 보조 지표인 멀티 Profile 도달률은 같은 분자를 전체 WAA 수로 나눠 계산해야 한다 (MUST). 두 비율을 서로 바꿔 표시하거나 하나의 이름으로 합치지 않아야 한다(MUST NOT).

#### Scenario: 대상 Account 일부가 두 Profile을 쓴다

- **WHEN** WAA 10개 중 멀티 Profile 대상 WAA가 4개이고 그중 2개가 멀티 Profile 활성 Account다
- **THEN** 활성 사용률은 50%다
- **AND** 도달률은 20%다

#### Scenario: 분모가 비어 있다

- **WHEN** 활성 사용률 또는 도달률의 분모가 0이다
- **THEN** 결과는 0%가 아니라 계산할 수 없음으로 표시된다

### Requirement: 리텐션과 절대 수

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 주간 대시보드는 WAA, 멀티 Profile 대상 WAA와 멀티 Profile 활성 Account의 절대 수를 비율과 함께 제공해야 한다(MUST). 기능 리텐션은 처음 멀티 Profile 활성 Account가 된 주의 집단이 W+1과 W+4에 다시 멀티 Profile 활성 Account가 된 비율로 계산해야 하며(MUST), 대상 Account 제품 리텐션은 기준 주의 멀티 Profile 대상 WAA가 W+1과 W+4에 다시 WAA가 된 비율로 계산해야 한다(MUST).

#### Scenario: 다음 주와 네 번째 주가 끝났다

- **WHEN** 기준 집단의 W+1과 W+4가 완료됐다
- **THEN** 같은 Asia/Seoul 주차로 기능 리텐션과 대상 Account 제품 리텐션을 각각 표시한다

#### Scenario: 비교 주가 아직 끝나지 않았다

- **WHEN** W+1 또는 W+4가 아직 끝나지 않았다
- **THEN** 해당 리텐션을 0%로 표시하지 않고 미도래로 표시한다

### Requirement: Profile 생성과 직접 전환

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — Profile 생성 횟수는 생성 mutation이 성공한 횟수여야 한다(MUST). Profile 전환은 이미 선택한 Profile이 있는 상태에서 Account가 다른 기존 Profile을 직접 선택해 성공한 경우만 세야 한다(MUST). 전환 관측은 출발 Profile과 도착 Profile의 opaque ID를 구분할 수 있어야 하고(MUST), 같은 Profile 재선택, 첫 선택, 생성 직후 자동 선택, Session 복원·화면 재조회, 실패와 취소를 전환으로 기록하지 않아야 한다(MUST NOT).

#### Scenario: 생성 성공 뒤 자동 선택이 실패한다

- **WHEN** Profile 생성 mutation은 성공하고 뒤따른 자동 선택은 실패한다
- **THEN** 생성은 1회로 센다
- **AND** 전환과 새 Profile 사용은 기록하지 않는다

#### Scenario: 다른 기존 Profile로 직접 바꾼다

- **WHEN** Profile A가 선택된 Account가 Profile B를 직접 선택하고 mutation이 성공한다
- **THEN** 출발 Profile A와 도착 Profile B가 연결된 전환을 1회 기록한다
- **AND** Profile B를 사용 Profile로 센다

#### Scenario: 같은 Profile을 다시 선택한다

- **WHEN** 선택 Profile과 도착 Profile이 같다
- **THEN** 선택 성공이더라도 전환 횟수에는 넣지 않는다

#### Scenario: 생성 직후 자동 선택한다

- **WHEN** 새 Profile 생성 성공 흐름이 그 Profile을 자동 선택한다
- **THEN** 선택 성공이면 새 Profile 사용에는 포함할 수 있다
- **AND** 직접 전환으로는 세지 않는다

### Requirement: 핵심 행동 귀속과 중복 제거

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 초기 핵심 행동은 Post 생성과 Follow 실행 성공이어야 한다(MUST). 관측은 행동을 시작한 인증 Account와 행동 주체 Profile에 귀속돼야 하며(MUST), 완료 전에 로그인 Account나 선택 Profile이 바뀌어도 새 주체로 옮기지 않아야 한다(MUST NOT). Follow Relationship 성립과 Follow Request 생성을 구분해야 한다(MUST). 같은 논리적 성공 관측의 전송 재시도는 한 번만 세고(MUST), 별도로 성공한 행동은 각각 세야 한다(MUST).

#### Scenario: 처리 중 선택 Profile이 바뀐다

- **WHEN** Profile A로 시작한 Post 생성이 끝나기 전에 화면의 선택 Profile이 B로 바뀐다
- **THEN** 성공 관측은 Profile A와 원래 인증 Account에 귀속된다

#### Scenario: Follow Request가 생긴다

- **WHEN** Follow 실행 성공 결과가 즉시 관계가 아니라 승인 대기 요청이다
- **THEN** 행동 주체 Profile 사용은 기록한다
- **AND** 결과는 Follow Request로 표시하고 Follow Relationship 성립으로 집계하지 않는다

#### Scenario: 같은 성공 관측을 재전송한다

- **WHEN** 전송 재시도로 같은 논리적 성공 관측이 두 번 수신된다
- **THEN** 지표는 해당 성공을 한 번만 센다

#### Scenario: 별도 행동이 연달아 성공한다

- **WHEN** 같은 Account와 Profile이 같은 주에 Post 두 개를 각각 성공적으로 생성한다
- **THEN** 두 성공은 각각 세고 같은 시각이나 Profile이라는 이유로 합치지 않는다

### Requirement: 제외 목록과 개인정보 경계

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 모든 지표는 익명 관측과 development·test 환경을 제외하고, 같은 버전의 운영 제외 목록으로 내부·테스트·알려진 자동화 Account를 제외해야 한다(MUST). 일반 조회와 주간 비교는 조회 시점의 최신 목록을 과거 주에도 적용해야 한다(MUST). 앱 소유 지표 관측에는 기존 opaque Account identity와 행동 주체 또는 선택 Profile의 opaque ID만 사용해야 하며(MUST), 이름·handle·Post Content·검색 원문·Follow 대상 Profile ID를 추가하지 않아야 한다(MUST NOT).

#### Scenario: 제외 목록에 Account를 추가한다

- **WHEN** 내부 Account를 최신 제외 목록에 새로 등록한다
- **THEN** 그 Account의 과거 관측도 모든 지표에서 제외된다
- **AND** 같은 Profile을 쓴 다른 Account의 관측은 유지된다

#### Scenario: 지표 관측 페이로드를 검사한다

- **WHEN** 화면, 선택, 생성, Post와 Follow 관측 페이로드를 검사한다
- **THEN** Account는 기존 opaque 분석 식별자로만 연결된다
- **AND** 허용된 행동 주체 또는 선택 Profile ID 외의 이름·handle·내용·검색 원문·대상 Profile ID가 없다

### Requirement: 보고와 검증

**Authority / Provenance:** `docs/domain/policies/multi-profile-usage.md`, [Linear PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산 계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`) — 주간 보고는 진행 중인 주를 부분 집계로 표시하고, 완료된 주마다 관측 기간, 집계 실행 시각, 계산 규칙 버전과 제외 목록 버전을 함께 제공해야 한다(MUST). PROD-555는 합성 자료로 계산 경계를 대조하고, PROD-795의 개인정보·운영 통합 검증이 끝난 뒤 production 실수집 관측으로 Account identity, Profile 귀속, 자격과 전환 분류를 대조해야 한다(MUST). 두 검증과 초기 Insight·대시보드·주간 점검 절차가 모두 끝나기 전에는 지표의 production 인수가 완료됐다고 표시하지 않아야 한다(MUST NOT).

#### Scenario: 진행 중인 주를 본다

- **WHEN** 현재 주의 지표를 조회한다
- **THEN** 결과는 부분 집계임을 표시한다
- **AND** 완료 주와 같은 확정 수치로 제시하지 않는다

#### Scenario: 합성 자료를 대조한다

- **WHEN** Profile 0·1·2개, 분모 0, 주간 경계, 재전송, 생성 뒤 선택 실패와 전환 제외 사례를 계산한다
- **THEN** 각 결과가 이 spec의 집합·비율·귀속 규칙과 일치한다

#### Scenario: production 인수 조건이 남아 있다

- **WHEN** 합성 검증은 끝났지만 PROD-795 통합 검증이나 production 실수집 대조가 끝나지 않았다
- **THEN** 남은 production 인수 책임을 미완료로 기록하고 인계한다
