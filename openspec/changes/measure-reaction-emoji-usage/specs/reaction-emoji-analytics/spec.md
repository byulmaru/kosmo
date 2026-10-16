## ADDED Requirements

### Requirement: 기존 Reaction 이벤트의 종류별 analytics delta

Web analytics는 선행 Reaction 기능이 허용하는 Unicode Type의 서버 확정 성공에 대해 기존 `reaction_added` 또는 `reaction_removed`를 한 번 기록하고, 기존 `reaction_type`과 Account identity를 유지하면서 `emoji_kind: 'unicode'` 및 안정적인 `reaction_emoji_key`를 추가한다. 별도 중복 이벤트를 만들어서는 안 된다(MUST NOT). 종류 key는 허용된 전체 시퀀스를 구분하며 표시 이름·이미지·지원 데이터의 순서에 의존하지 않는다. **Source Context:** [PROD-986](https://linear.app/byulmaru/issue/PROD-986), [PROD-539](https://linear.app/byulmaru/issue/PROD-539), 현재 사용자의 PROD-942 Stack 의존 지시.

#### Scenario: 두 Profile에서 같은 종류를 사용하는 Account

- **WHEN** 한 Account의 두 Profile이 허용된 같은 Unicode Type의 Reaction을 각각 추가하는 데 성공한다
- **THEN** 두 `reaction_added`의 종류 key는 같고, 분석에서 사용 Account 수는 1이며 추가 횟수는 2다

#### Scenario: 성공 경계를 확인할 수 없는 mutation

- **WHEN** mutation이 실패하거나 network 오류 또는 필요한 성공 payload가 없는 응답을 반환한다
- **THEN** 앱은 해당 성공 이벤트를 기록하지 않는다

### Requirement: 허용되지 않은 종류와 개인 정보의 경계

지원 집합에서 확인되지 않은 Type에 대해서도 기존 성공 이벤트는 유지해야 하며(MUST), 종류 key와 Unicode/custom 구분을 생략한다. 앱에서 추가하는 custom event property에는 Post·Profile ID, 콘텐츠, Reaction DB ID, 이름·shortcode·표시 원문, 미승인 사용자 정의 emoji 식별값, 오류 원문, 직접 식별 trait 또는 중복 Account ID를 포함하지 않는다. **Source Context:** [PROD-986](https://linear.app/byulmaru/issue/PROD-986)의 미매핑 fallback·금지 property 및 custom emoji 후속 경계.

#### Scenario: 지원 집합 밖의 값

- **WHEN** 성공 callback에 분석용 key를 검증할 수 없는 Type이 들어온다
- **THEN** 기존 성공 이벤트의 `reaction_type`은 유지하고 종류 property는 없으며 임의 문자열을 fallback으로 보내지 않는다

### Requirement: 같은 범위의 종류별 사용 지표

같은 `Asia/Seoul` 기간에 관측된 production Web의 식별된 Account를 대상으로 종류별 값을 제공해야 한다(SHALL). 구체적으로 key별 `reaction_added`가 한 번 이상 있는 distinct Account 수, 추가 횟수, Account당 추가 횟수와 분포를 구분한다. 같은 기간의 `reaction_removed` 횟수는 별도로 제공한다. 내부·테스트 Account 및 봇 제외는 검증된 식별 근거가 있을 때만 적용하고, 적용 여부와 기준을 기록한다. key 없는 과거 이벤트와 수집 비활성 기간은 특정 종류에 배분하거나 backfill하지 않는다. **Source Context:** [PROD-986](https://linear.app/byulmaru/issue/PROD-986)의 세 지표와 관측 한계, PROD-795의 Account identity.

#### Scenario: 소수 Account의 반복 사용

- **WHEN** 한 Account가 같은 종류를 여러 번 추가하고 다른 Account는 한 번 추가한다
- **THEN** 사용 Account 수와 총 추가 횟수 및 Account별 분포가 별도 값으로 재현된다

#### Scenario: 제거 횟수와 현재 상태

- **WHEN** 관측 기간에 추가·제거 이벤트가 모두 있다
- **THEN** 추가 횟수와 제거 횟수를 각각 제공하고 그 차이를 현재 남아 있는 Reaction 수로 표시하지 않는다

### Requirement: Account 귀속과 분석 장애 격리

요청이 시작된 Account와 다른 Account가 현재 식별된 뒤 도착한 늦은 성공 응답을 새 Account의 성공 행동으로 기록해서는 안 된다(MUST NOT). PostHog의 초기화·identify·capture 실패는 Reaction mutation 결과와 사용자 오류 처리에 영향을 주지 않는다. **Source Context:** [PROD-986](https://linear.app/byulmaru/issue/PROD-986)의 성공·늦은 응답·Account 전환·분석 장애 조건과 [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 기존 계약.

#### Scenario: Account 전환 후 늦은 응답

- **WHEN** Account A가 시작한 Reaction 요청의 성공 응답이 Account B로 전환한 뒤 도착한다
- **THEN** 앱은 이를 Account B의 `reaction_added` 또는 `reaction_removed`로 기록하지 않는다

#### Scenario: 분석 전송 장애

- **WHEN** 서버가 Reaction 성공을 확인했지만 PostHog가 실패한다
- **THEN** Reaction의 성공 결과와 UI 오류 처리는 기존 동작을 유지한다
