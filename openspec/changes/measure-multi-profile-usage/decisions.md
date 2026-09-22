## Context

이 기록은 `docs/domain/policies/multi-profile-usage.md`와 Linear PROD-555가 승인한 계산 계약을 구현 가능한
관측·집계 구조로 옮기기 위한 현재 세션의 작업 메모다. Implementation Choice는 수정 가능한 권장안이다.
승인 전 record, 현재 코드와 PostHog SDK는
근거를 해석하고 구현 방식을 고르는 참고 자료이며 제품 계약의 authority가 아니다.

## Decision Records

### 기능 자격을 주 지표의 분모로 사용한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약과 `2026-09-03 멀티 Profile 계산
계약 승인` 댓글(`2b97dc17-844c-4b62-a128-3344d53b123a`)
- Status: Active
- Context / Problem: 전체 WAA만 분모로 쓰면 단일 Profile Account 구성 변화와 멀티 Profile 기능 채택 변화를
  구분하기 어렵다.
- Decision Outcome: 멀티 Profile 대상 WAA 대비 활성 Account 비율을 주 지표로 사용한다. 전체 WAA 대비 같은
  분자의 비율은 도달률로 따로 표시한다. 리텐션은 두 비율의 주간 변화로 추정하지 않고 W+1·W+4 집단 지표로
  계산한다.
- Alternatives Considered: WAA 단독 비율은 제품 전체 도달 범위에는 유용하지만 기능 자격이 없는 Account가
  늘어나는 영향을 함께 받아 주 지표로 사용하지 않는다.
- Consequences: 대시보드는 두 분모와 세 집단의 절대 수를 함께 보여야 하며, 두 비율의 이름을 바꿔 쓸 수
  없다.
- Confirmation / Follow-up: 합성 자료에서 WAA 10, 대상 WAA 4, 활성 Account 2일 때 활성 사용률 50%, 도달률
  20%인지 확인한다.

### 기존 Profile 목록을 자격 판정에 사용한다

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Status: Active
- Context / Problem: 자격은 사용량과 무관하게 같은 시점에 선택 가능한 Profile이 2개 이상인지 판단해야 한다.
  현재 `Account.profiles`는 Membership과 공통 조회 가능 조건을 적용한 결과를 이미 제공한다.
- Decision Outcome: 인증 shell 쿼리가 받은 `me.profiles`의 distinct 결과가 2개 이상인지로 자격 boolean을
  계산한다. 새 count API나 Profile ID 목록 속성은 만들지 않는다.
- Alternatives Considered: 전용 eligibility API는 같은 정책을 서버에 중복하고 API 변경을 늘린다. 선택 성공
  횟수로 자격을 추정하는 방식은 행동량으로 분모를 만드는 순환 정의라서 제외한다.
- Consequences: Local·Remote와 Owner·Member를 별도로 걸러내지 않는다. Relay cache의 이전 결과가 잠시 보일
  수 있으므로 network 갱신 뒤 전송 관측을 production 실수집에서 대조한다.
- Confirmation / Follow-up: Profile 0·1·2개와 조회 불가 Profile이 섞인 브라우저 자료에서 GraphQL 결과와
  eligibility boolean을 비교한다.

### 화면 문맥과 직접 전환을 별도 이벤트로 기록한다

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Status: Active
- Context / Problem: 표준 pageview는 selected Profile과 자격을 모르고, 기존 `profile_selected`는 첫 선택,
  재선택과 생성 자동 선택을 직접 전환과 구분하지 않는다.
- Decision Outcome: 단일 shell 관측 지점에서 `multi_profile_context_observed`를 보내고
  `selected_profile_id`와 `multi_profile_eligible`만 담는다. 기존 `profile_selected`는 모든 선택 성공의 도착
  Profile 관측으로 유지한다. 서로 다른 기존 Profile 사이의 직접 선택 성공에는 `profile_switched`를 추가하고
  `previous_profile_id`, `selected_profile_id`를 담는다.
- Alternatives Considered: app-owned pageview를 다시 보내면 표준 SDK 계약과 중복된다. 기존
  `profile_selected`에 원인과 출발 Profile을 추가할 수도 있지만 과거 관측과 필터를 잘못 섞을 가능성이 커
  기본안에서 제외한다.
- Consequences: 화면 조회마다 앱 소유 이벤트 하나가 늘어난다. pathname, Profile 목록, 이름과 handle은 앱 소유
  속성으로 추가하지 않는다. 생성 자동 선택은 `profile_selected`에는 남지만 `profile_switched`에는 들어가지
  않는다.
- Confirmation / Follow-up: desktop·compact·drawer 조합에서 route마다 문맥 이벤트가 중복되지 않는지,
  첫 선택·재선택·자동 선택·직접 전환의 이벤트 조합이 다른지 확인한다.

### mutation 시작 시점의 주체와 이벤트 UUID를 고정한다

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Status: Active
- Context / Problem: mutation이 끝나기 전에 selected Profile이나 Account identity가 바뀔 수 있고, app 콜백과
  transport 재시도가 같은 성공을 두 번 보낼 수 있다.
- Decision Outcome: mutation을 시작할 때 Account identity, 행동 주체 Profile과 논리적 작업 ID를 closure에
  고정한다. 성공 이벤트는 고정한 Profile을 사용한다. 현재 PostHog Account가 시작 시점과 다르면 이벤트를
  생략해 다른 Account로의 오귀속을 막는다. 이벤트 종류마다 작업 ID에서 고정한 UUID를 public PostHog capture
  옵션으로 전달하고 재시도에서 다시 만들지 않는다.
- Alternatives Considered: 완료 시점의 현재 selected Profile은 원래 행동 주체를 잃는다. Account ID를 앱 소유
  속성으로 추가하면 개인정보 최소화와 식별자 단일 경계를 깨뜨린다. `$insert_id`나 SDK 내부 함수를 직접
  조작하는 방식은 공개 API보다 취약해 제외한다.
- Consequences: Account가 바뀐 동안 끝난 성공 이벤트는 누락될 수 있다. 잘못된 귀속보다 이 누락을 허용하고
  production 수집 범위 한계로 기록한다. 현재 lockfile `posthog-js@1.417.4`의 공개 UUID 옵션을 사용하되
  의존성 변경 시 타입과 페이로드 검증을 다시 한다.
- Confirmation / Follow-up: Relay 콜백 중 Profile·Account 전환, 콜백 재호출과 엔드포인트 재시도에서
  주체·UUID·이벤트 수를 확인한다. PostHog SDK의 UUID 지원은 공식
  [types changelog](https://github.com/PostHog/posthog-js/blob/main/packages/types/CHANGELOG.md)와 설치된 type을
  함께 확인한다.

### 주간 Account 자료를 저장 HogQL 쿼리로 계산한다

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Status: Active
- Context / Problem: 한 Account의 여러 이벤트에서 distinct Profile을 합치고 자격 boolean과 교차해야 하므로
  단순 이벤트 Trends만으로 승인된 분자와 분모를 안전하게 재현하기 어렵다.
- Decision Outcome: Asia/Seoul 주차와 Account를 기준으로 WAA 여부, 자격 여부, distinct 사용 Profile 수와
  활성 여부를 한 행에 만드는 저장 HogQL 쿼리를 기준 자료로 둔다. 두 비율, 절대 수, 전환·생성·핵심 행동과
  리텐션은 이 자료 또는 같은 결과를 보장하는 후속 저장 쿼리에서 계산한다.
- Alternatives Considered: 서로 독립된 Insight 수를 formula로 나누면 분자가 대상 분모의 부분집합인지 확인하기
  어렵고, distinct Profile 2개 조건을 안정적으로 표현하기 어렵다.
- Consequences: 대시보드 시각화보다 저장 쿼리가 계산 기준이 된다. 쿼리에는 최신 제외 목록 한 버전과
  계산 규칙 버전, 실행 시각을 연결한다.
- Confirmation / Follow-up: 같은 합성 이벤트 집합을 독립 계산한 표와 HogQL 결과가 일치하는지 대조한다.

### 최신 제외 목록을 과거 주에도 같은 방식으로 적용한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)의 승인된 계산 계약
- Status: Active
- Context / Problem: 내부·테스트·자동화 Account를 주마다 다른 기준으로 제외하면 시계열을 비교할 수 없고,
  새로 발견한 테스트 Account의 과거 활동이 남는다.
- Decision Outcome: 접근이 제한된 운영 제외 목록을 버전으로 관리하고 모든 쿼리가 같은 최신 버전을 과거
  주에도 적용한다. 보고에는 목록 버전과 집계 실행 시각을 함께 남긴다.
- Alternatives Considered: 주별 당시 목록을 고정하면 수치 재현은 쉽지만 이미 확인한 비제품 활동이 과거
  수치에 남는다. 이름·handle·IP 기반 자동 추정은 승인된 경계를 벗어나 제외한다.
- Consequences: 이전에 보고한 완료 주 수치가 바뀔 수 있다. 변경 전후 수치는 각 집계 실행 시각과 목록 버전으로
  구분한다.
- Confirmation / Follow-up: 제외 Account를 추가한 뒤 과거 주의 해당 Account 활동만 빠지고 같은 Profile을
  사용한 다른 Account는 유지되는지 확인한다.

### 지표 change의 인수와 archive를 PROD-555가 끝까지 소유한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/multi-profile-usage.md`; [Linear
  PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Status: Active
- Context / Problem: base PostHog 전환, 개인정보 통합과 이 지표의 계산 검증은 완료 조건과 담당자가 다르다.
- Decision Outcome: PROD-555는 이벤트, 합성 검증, Insight·대시보드, production 실수집 대조, 주간 점검 절차와
  이 change의 선택적 정리를 맡는다. PROD-795 통합 검증은 production 인수의 선행 조건으로 유지하고,
  PROD-575의 base PostHog acceptance·archive 책임은 가져오지 않는다.
- Alternatives Considered: base 전환이 끝났다는 이유로 지표 change도 완료하는 방식은 계산 계약과 actual
  수집 대조를 건너뛰므로 제외한다.
- Consequences: 구현 PR의 Ready, 이슈의 production 인수와 OpenSpec 정리는 별도로 판단한다. 현재
  `AGENTS.md`와 `memory/issue-openspec-workflow.md`에 따라 archive를 완료 조건으로 요구하지 않는다.
- Confirmation / Follow-up: tasks와 handoff가 남은 gate, 통합 검증과 archive owner를 분리해 표시한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 승인 전 record의 `멀티 Profile 활성 Account 수 / WAA` 단독 사용률 안은 2026-09-03 승인으로 대체됐다.
  해당 비율은 멀티 Profile 도달률로 남고, 주 지표는 멀티 Profile 대상 WAA를 분모로 사용한다.
