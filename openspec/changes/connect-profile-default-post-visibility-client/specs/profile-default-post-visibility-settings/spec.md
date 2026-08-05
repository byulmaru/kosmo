## ADDED Requirements

### Requirement: Profile 기본 Post Visibility 설정 UI

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-667` MUST: 유니버설 앱은 canonical `/settings`의 현재 Local Profile 영역에서 Profile identity와 기본 Post Visibility를
구분해 표시하고, Owner가 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 저장할 수 있게 해야 한다(MUST).
설정 UI는 Profile별 dirty·pending·success·error·retry 상태를 소유하고(MUST), selected Profile 또는 Relay
Environment 전환 뒤 이전 문맥의 값이나 늦은 응답을 새 대상에 적용해서는 안 된다(MUST NOT). Member는 서버가
반환한 기본값을 Composer에서 소비할 수 있지만 설정 변경 action을 사용할 수 없어야 한다(MUST NOT).

#### Scenario: canonical settings Profile 영역 연결

- **WHEN** Owner가 canonical `/settings`를 현재 Local Profile과 함께 연다
- **THEN** 앱은 generic settings page가 소유한 Profile identity 다음에 기본 Post Visibility 설정 control을 표시한다
- **AND** 접근성 이름은 Kosmo 내부 Profile 설정과 현재 대상 Profile을 식별한다
- **AND** Byulmaru ID Account entry의 label·external navigation·오류 상태를 재구현하지 않는다

#### Scenario: 현재 Profile 설정 표시

- **WHEN** Owner가 설정 가능한 Local Profile의 기본 Post Visibility control을 확인한다
- **THEN** 앱은 현재 설정 대상 Profile identity와 저장된 기본 Post Visibility를 함께 표시한다
- **AND** `PUBLIC`, `UNLISTED`, `FOLLOWERS` 각각의 의미를 설명한다
- **AND** 저장값을 임의의 client 전역값이나 다른 Profile의 마지막 값으로 대체하지 않는다

#### Scenario: 변경 저장

- **WHEN** Owner가 다른 기본 Post Visibility를 선택하고 저장한다
- **THEN** 앱은 dirty 상태를 표시하고 저장 중 중복 제출을 차단한다
- **AND** 성공하면 mutation이 반환한 Profile 값으로 Relay record를 수렴시키고 성공을 알린다
- **AND** Composer에서 개별 Visibility를 바꾸는 동작은 Profile 설정 mutation을 호출하지 않는다

#### Scenario: 저장 실패와 재시도

- **WHEN** 기본 Post Visibility 저장이 실패한다
- **THEN** 앱은 선택한 값과 현재 대상 Profile을 유지한 채 안전한 실패 안내와 재시도 action을 제공한다
- **AND** Backend 오류 원문이나 다른 Profile의 값을 fallback으로 표시하지 않는다

#### Scenario: Profile 전환 중 늦은 응답 격리

- **WHEN** 설정 조회 또는 저장이 진행 중인 동안 selected Profile이나 Relay Environment가 바뀐다
- **THEN** 앱은 새 문맥의 Profile identity와 설정값으로 control 상태를 새로 시작한다
- **AND** 이전 문맥의 늦은 조회·mutation completion은 새 Profile의 값, success, error 또는 pending 상태를
  변경하지 않는다

#### Scenario: Owner가 아닌 Member의 변경 금지

- **WHEN** 대상 Local Profile의 Member이지만 Owner가 아닌 Account가 설정 UI를 사용한다
- **THEN** 앱은 기본 Post Visibility 변경 action을 제공하거나 mutation을 실행하지 않는다
- **AND** Member는 Backend가 반환한 기본값을 새 Composer 초기값으로 계속 사용할 수 있다
