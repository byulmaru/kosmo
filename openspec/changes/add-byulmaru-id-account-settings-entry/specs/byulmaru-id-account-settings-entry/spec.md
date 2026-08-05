## ADDED Requirements

### Requirement: Byulmaru ID Account Settings 외부 진입점 표시

Kosmo 설정 페이지의 Account 행은 시각 label `계정 설정`을 제공해야 한다(MUST). link accessible name은
`Byulmaru ID Account Settings 외부 서비스로 이동`처럼 Byulmaru ID가 소유한 외부 Account Settings로 이동한다는
사실을 전달해야 한다(MUST). 실제 외부 navigation 행에만 chevron을 표시해야 하며(MUST), `계정 설정` heading·
소유자 label·설명 block을 별도로 반복해서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645`

#### Scenario: Account 외부 행을 표시한다

- **WHEN** 인증 사용자가 `/settings`의 Account content를 본다
- **THEN** Account 행의 visible label은 `계정 설정`이다
- **AND** 행의 accessible name은 Byulmaru ID 외부 Account Settings 이동 의미를 전달한다
- **AND** 행은 다른 위치를 여는 chevron을 표시한다
- **AND** 행 앞뒤에 `계정 설정` heading, 소유자 label 또는 설명 block을 별도로 표시하지 않는다

#### Scenario: Profile control과 이동 의미를 구분한다

- **WHEN** Account 외부 진입점과 Kosmo Profile control이 같은 설정 페이지에 표시된다
- **THEN** Account 행만 외부 navigation link와 chevron을 제공한다
- **AND** Profile control은 Account 외부 이동을 암시하는 accessible name 또는 chevron을 사용하지 않는다

### Requirement: Canonical Byulmaru ID URL과 실제 external Link

Account 외부 진입점은 canonical URL `https://id.byulmaru.co`를 Expo Router `Link`의 exact external `href`로 사용해야 한다(MUST).
Web·Android·iOS
모두 같은 external Link semantics를 사용해야 하며(MUST), Kosmo 내부 Account route·generic placeholder·다른
URL로 이동해서는 안 된다(MUST NOT). 브라우저 또는 OS가 navigation을 소유하며, Kosmo는 URL 지원 확인,
navigation 성공·실패, loading·error·retry·lock 상태를 소유해서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/design/settings.md`, `PROD-645`

#### Scenario: 모든 플랫폼에서 canonical external Link를 제공한다

- **WHEN** Web, Android 또는 iOS에서 Account 외부 진입점을 렌더링한다
- **THEN** 렌더링된 행은 `Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}` 구조의 link semantics를 가진다
- **AND** href는 정확히 `https://id.byulmaru.co`다
- **AND** 브라우저 또는 OS가 외부 navigation을 실행하며 Kosmo 내부 Account route를 열지 않는다

#### Scenario: Kosmo가 Account 설정 또는 navigation lifecycle을 소유하지 않는다

- **WHEN** Account 외부 진입점을 렌더링하거나 활성화한다
- **THEN** Kosmo는 Account 값을 조회하거나 입력·저장 상태를 만들지 않는다
- **AND** Kosmo component에는 Platform/Linking 기반 support check, JS `onPress`, navigation 결과 처리,
  loading·error·retry·lock 상태가 없다
- **AND** 비밀번호·패스키·이메일·계정 삭제 UI를 추가하지 않는다

### Requirement: 외부 진입점 접근성과 입력 방식

Account 외부 진입점은 실제 동작에 맞는 link role, accessible name과 focus-visible 상태를 제공해야 한다(MUST).
Web keyboard·pointer와 Android·iOS touch·screen reader에서 같은 canonical link destination을 제공해야 하며(MUST),
Web pointer target은 최소 24×24 CSS px 또는 공식 예외를 충족해야 하고(MUST), iOS는 기본 44×44pt, Android는
48×48dp touch target을 사용해야 한다(MUST).

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645`

#### Scenario: Web keyboard로 외부 진입점을 탐색한다

- **WHEN** Web keyboard 사용자가 Account 외부 link에 focus한다
- **THEN** link role과 Byulmaru ID 외부 Account Settings accessible name을 확인할 수 있다
- **AND** focus-visible 상태와 canonical `href`를 확인할 수 있다
- **AND** 활성화 시 browser 기본 link navigation 의미를 유지한다

#### Scenario: screen reader로 외부 진입점을 이해한다

- **WHEN** screen reader 사용자가 Account 외부 진입점을 탐색한다
- **THEN** 하나의 link target과 accessible name에서 Byulmaru ID 외부 Account Settings 이동임을 이해할 수 있다
- **AND** 장식용 chevron은 별도 focus target이나 interactive element로 노출되지 않는다

#### Scenario: 플랫폼별 interactive target을 유지한다

- **WHEN** Account 외부 진입점을 Web, iOS 또는 Android에서 표시한다
- **THEN** 각 플랫폼의 24×24 CSS px, 44×44pt 또는 48×48dp target 계약을 충족한다
- **AND** text scaling과 reflow에서도 label과 link가 잘리거나 가로 scroll에 의존하지 않는다
