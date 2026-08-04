## 1. PROD-645 Byulmaru ID Account 외부 진입점

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-645`

**Deliverable**

사용자가 Byulmaru ID 소유의 Account 수준 설정임을 이해할 수 있는 평면 행을 실행해 canonical Account
Settings로 외부 이동하고, 지원 불가·이동 실패 뒤 같은 동작을 재시도할 수 있다.

**Guardrails**

- destination은 `https://id.byulmaru.co`이며 Kosmo 내부 route, generic placeholder 또는 추론한 provider
  subpath로 바꾸지 않는다.
- 별도 `계정 설정` heading·소유자 label·설명 block, Account 데이터 query·form·save 상태를 만들지 않는다.
- 전체 행만 link target으로 제공하고 외부 navigation을 가진 Account 행에만 chevron을 표시한다.
- 실패는 Account child 가까이에서 복구하고 정상인 page heading과 Profile 기능을 숨기지 않는다.

**Verification**

- label·accessible name·link role·chevron, exact URL과 지원 확인→외부 이동 순서를 component test로 검증한다.
- 지원 불가, 지원 확인 rejection, 이동 rejection과 재시도 성공에서 안전한 오류·announcement·상태 복구를
  검증한다.

- [x] 1.1 Byulmaru ID 소유권·Account 수준 설정·외부 이동 의미와 플랫폼 target을 전달하는 concrete 평면 Account 행을 구현한다.
- [x] 1.2 canonical URL의 플랫폼별 외부 이동, 중복 실행 방지와 child-local 실패·재시도 동작을 구현한다.

## 2. PROD-645 독립 기능 검증과 통합 handoff

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-645`
- `PROD-653`

**Deliverable**

PROD-653이 임시 slot API 없이 `/settings` 첫 번째 Account 행에 직접 통합할 수 있는 concrete child와 기능
검증 증거가 준비된다.

**Guardrails**

- PROD-645 diff에 `/settings` route, 공통 page shell, Profile identity/control 또는 shell navigation을
  추가하지 않는다.
- standalone Storybook 결과를 production `/settings` 통합 또는 Android·iOS runtime 완료 증거로 표현하지
  않는다.
- PROD-653이 page-level 통합, platform runtime 검증과 `add-settings-page-shell` 정합성·archive를 계속
  소유한다.

**Verification**

- component unit test가 happy path, 실패 분기, exact copy·semantics와 retry를 통과한다.
- React Native Web Storybook에서 기본 행과 실패→재시도 interaction 및 자동 접근성 검증을 통과한다.
- TypeScript, formatting과 이 change의 strict OpenSpec validation을 통과하고 구현 diff에 범위 외 route·shell
  변경이 없는지 확인한다.

- [x] 2.1 Account 행의 정상·지원 불가·확인 실패·이동 실패·재시도 성공과 접근성 계약을 검증하는 component test를 추가한다.
- [x] 2.2 기본 행과 실패·재시도 상태를 검토할 Storybook catalog와 interaction 검증을 추가한다.
- [ ] 2.3 관련 자동 검증과 strict OpenSpec validation을 통과시키고 PROD-653 통합에 필요한 concrete child handoff를 기록한다.
