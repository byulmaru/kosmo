## 1. PROD-645 Byulmaru ID Account 외부 링크 child

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-645`

**Deliverable**

사용자가 `계정 설정` 행의 accessible name과 canonical destination을 통해 Byulmaru ID가 소유한 외부 Account
Settings임을 이해하고, 모든 플랫폼에서 실제 external link를 사용할 수 있는 concrete child를 제공한다.

**Guardrails**

- destination은 `https://id.byulmaru.co`인 Expo Router external `Link`의 exact `href`다.
- 시각 label은 `계정 설정`이며 accessible name은 `Byulmaru ID Account Settings 외부 서비스로 이동`이다.
- 전체 행만 link target으로 제공하고 외부 navigation 행에만 chevron을 표시한다.
- component에 Platform/Linking, JS `onPress`, URL support check, navigation success/failure, loading/error/
  retry/lock 상태와 helper를 만들지 않는다.
- `/settings` route, page shell, Profile 구현과 production navigation을 추가하지 않는다.

**Verification**

- label·accessible label·link role·exact href·chevron·focus-visible style과 JS `onPress` 부재를 component test로
  검증한다.
- Storybook은 기본 실제 link 한 상태에서 visible label, accessible external link, canonical href와 focus 가능성을
  검증하며 실제 navigation을 실행하지 않는다.

- [x] 1.1 `계정 설정` label과 Byulmaru ID 외부 Account Settings accessible name을 가진 평면 link 행을 구현한다.
- [x] 1.2 모든 플랫폼에 `Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}`를 적용하고 chevron·target
      geometry·focus-visible styling을 유지한다.

## 2. PROD-645 독립 기능 검증과 통합 handoff

**Authority / Provenance**

- `docs/design/settings.md`
- `PROD-645`
- `PROD-685`
- `PROD-684`
- `PROD-653` (completed predecessor information architecture)

**Deliverable**

`PROD-685`가 별도 slot API 없이 `PROD-645`·`PROD-667` child를 production `/settings` route/navigation에 조립할
수 있는 static child와 검증·문서 정합성 증거를 전달한다.

**Guardrails**

- `PROD-645` diff에 production `/settings` route, page shell, Profile 또는 shell navigation을 추가하지 않는다.
- standalone Storybook과 unit test를 production route·Web/Android/iOS page-level 완료 증거로 표현하지 않는다.
- `PROD-685`가 route/navigation, child assembly와 page-level 검증을, `PROD-684`가 최종 Settings 통합 및
  OpenSpec completion/archive를 소유한다. `PROD-653`은 active integration/archive owner가 아니다.

**Verification**

- component unit test가 새 static label·semantics·href·focus 계약을 통과한다.
- React Native Web Storybook이 기본 링크의 접근성 tree·focus·href 검증을 통과하며 외부 navigation을 실행하지
  않는다.
- TypeScript, formatting, strict OpenSpec validation과 diff 범위 검증을 수행한다.

- [x] 2.1 Account 행의 label·accessible name·link role·exact href·chevron·focus-visible·JS onPress 부재를
      검증하는 component test를 추가한다.
- [x] 2.2 기본 실제 link와 visible label·canonical href·focus 가능성을 검증하는 단일 Storybook story를 추가한다.
- [x] 2.3 관련 자동 검증과 strict OpenSpec validation을 통과시키고 `PROD-685`·`PROD-684` ownership에 맞는
      concrete child handoff와 문서 정합성을 기록한다.
