# Storybook 디자인 계약 이관 기준

## 목적과 근거

Figma는 KOSMO UI의 시각·상태 디자인 계약 원천이다. KOSMO에서는 `apps/app` Storybook을 실제 Production 컴포넌트를 애플리케이션의 business logic과 context에서 격리해 구현·검증·리뷰하고, 그 상태·예시·interaction을 합의하는 실행 가능한 UI 코드 계약의 원천으로 사용한다. 실제 Production 화면은 story 코드를 복사하지 않고 Storybook에서 검증한 동일한 Production 컴포넌트와 상태 계약을 재사용해 조립한다. route·data·Relay/API·mutation·cache·권한·제품 정책은 Storybook에서 필요한 최소 mock과 시나리오 경계만 제공하며, 실제 network·runtime 통합은 대응 Production runtime에서 연결한다.

공용 UI 계약의 이관 흐름은 `Figma 디자인 계약 → Storybook에서 Production 컴포넌트 구현·승인 → Production 화면 조립·runtime 통합`이며, 조립된 Page·Screen은 다시 Storybook의 대표 시나리오로 검증한다.

Storybook에서 렌더링하거나 검증했다는 사실만으로 Web·iOS·Android Production runtime이 완료된 것은 아니다. route, data, Relay, API, mutation, cache, 권한, 제품 정책과 실제 플랫폼 동작은 대응 Product 이슈와 runtime QA가 별도로 소유한다.

이 문서는 [Figma 작업 규칙](./figma.md), [접근성 기준](./accessibility.md), [UI Foundation 규칙](./foundations.md)과 각 surface의 디자인 문서를 Storybook으로 이관할 때 공통으로 적용한다.

## 이관 순서와 소유권

| 단계                         | 소유하는 것                                                                                   | 소유하지 않는 것                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Figma DSN                    | 시각 구조, variant, component-owned state와 responsive·theme 기준                             | Production 코드와 runtime 완료 판정                           |
| `PROD-850`                   | 이 문서의 분류, authoring과 검증 경계                                                         | 기존 story 구조 변경과 DSN별 실제 이관                        |
| `PROD-865`                   | 기존 Storybook의 폴더·title·Playground 구조 변경과 기존 검증 보존                             | DSN별 디자인 계약과 Production runtime 구현                   |
| `PROD-851`~`PROD-864`, `866` | 각 DSN의 Production 공용 UI, story, Controls·Actions·play와 Storybook 검증                    | route·data·API·권한·제품 정책                                 |
| 대응 Product 이슈            | route, data, Relay, API, mutation, cache, 권한, 제품 정책과 Web·iOS·Android runtime 연결·검증 | Figma 또는 Storybook 완료 사실만으로 추론한 runtime 완료 판정 |

Figma 계약을 Storybook에 먼저 이관하고 팀이 Storybook 결과를 직접 사용·리뷰한 뒤 대응 Product 이슈의 runtime 연결을 진행한다. Linear의 부모·자식 관계만으로 선후관계를 추론하지 않고 각 이슈의 `blocks`·`blockedBy`를 따른다.

완료된 `PROD-775`·`DSN-39` Primitive의 Production 컴포넌트는 재구현하지 않는다. TextField, StateView, ActionMenu, Toast와 RadioOption의 기존 story 구조와 부족한 Playground·Controls·Actions·play 보강은 `PROD-865`가 소유한다.

## 분류, 경로와 title

아래 분류와 `apps/app/src/stories/` 중앙 배치는 Storybook 공식 표준이 아니라 기존 KOSMO catalog를 정리하기 위해 이 저장소에서 사용하는 authoring convention이다.

Story는 `apps/app/src/stories/` 아래의 다음 네 폴더에 둔다.

```text
apps/app/src/stories/
  foundations/
  components/
  patterns/
  screens/
```

| 분류          | 기준                                                                                  | CSF title prefix    |
| ------------- | ------------------------------------------------------------------------------------- | ------------------- |
| `foundations` | color, typography, spacing, radius, elevation, icon, motion처럼 UI 전반이 공유하는 값 | `KOSMO/Foundations` |
| `components`  | 의미 있는 props·state를 소유하며 여러 surface에서 재사용하는 단일 Production UI       | `KOSMO/Components`  |
| `patterns`    | 여러 component를 조합해 반복 사용하는 menu, composer, list item, shell 등의 surface   | `KOSMO/Patterns`    |
| `screens`     | route 또는 page 수준의 사용자 시나리오와 데이터 상태                                  | `KOSMO/Screens`     |

파일명과 title은 이슈 번호가 아니라 foundation·component·pattern·screen 이름을 사용한다. 예를 들어 `components/TextField.stories.tsx`는 `KOSMO/Components/TextField`를 사용한다. 상태와 viewport 이름은 title에 넣지 않고 story export와 parameters로 표현한다.

기존 `apps/app/src/stories/` 직하의 story 이동·분할과 title 정렬은 `PROD-865`에서 수행한다. DSN별 이관 이슈는 `PROD-865`가 확정한 구조를 재사용하며 별도 catalog root나 UI package를 만들지 않는다.

새로 이관하는 서로 다른 Production component를 하나의 `Catalog` title 아래 모으지 않는다. 각 component는 독립 title 아래 실제 검토 목적이 있는 canonical 상태, Playground, 대표 상태와 자동 검증 표면만 제공하며, 의미가 같은 story를 형식적으로 모두 만들지 않는다. foundation token은 `KOSMO/Foundations/Tokens` 아래에서 종류별 story로 나눈다. 아직 DSN별 이관 전인 기존 pattern·screen 대형 story는 현재 `Catalog` title을 임시로 유지하고 대응 `PROD-851`~`PROD-864`, `PROD-866`에서 component 경계가 확정될 때 분리한다. Theme은 별도 Light·Dark story를 복제하지 않고 toolbar로 전환한다.

## Production 컴포넌트와 fixture 경계

- Story는 `apps/app/src`의 실제 Production 컴포넌트나 screen을 직접 렌더링한다.
- args를 controlled prop에 연결하거나 사용자 시나리오를 구성하는 얇은 fixture는 허용한다. Production UI, 상태 전이 또는 시각 구조를 story 전용 컴포넌트로 복제하지 않는다.
- Relay fragment component는 공용 `RelayStoryProvider`와 operation payload를 사용해 실제 fragment ref 계약을 유지한다. raw object를 generated `$key`로 cast하지 않는다.
- 공용 Theme, Safe Area, Toast, Content Warning, Relay와 Router 환경은 `.storybook/preview.tsx`의 decorator와 mock을 재사용한다. component가 직접 소유하지 않는 provider를 일반 story마다 중복하지 않는다. 두 theme의 semantic style을 한 번에 비교하는 자동화 전용 `Tests` fixture만 명시적인 `ThemeProvider`를 중첩할 수 있다.
- route·Relay·platform mock은 해당 story를 실행하는 데 필요한 최소 경계만 제공한다. mock 성공은 Production route, network, cache나 platform integration의 증거가 아니다.

## Story 종류

### 재사용 UI

재사용 가능한 component와 pattern은 다음 표면을 제공한다.

1. `Default` 또는 `Base`: Playground와 구분되는 안정적인 canonical Production 상태. 제품의 명확한 기본값이 있으면 `Default`, 필수 semantic 입력이 있어야 성립하면 `Base`를 사용하며 Controls나 상태를 바꾸는 `play`를 두지 않는다.
2. `Playground`: args로 component-owned props와 controlled state를 사람이 조절하고 Actions에서 callback을 관찰하는 수동 검토 표면. 같은 state나 Actions 기록을 자동으로 바꾸는 `play`를 두지 않는다.
3. 대표 상태 story: Playground 한 개로 비교하기 어려운 selected, disabled, loading, error, empty, long-content, responsive 상태를 정적으로 비교하는 표면.
4. `Tests`: click, typing, keyboard, focus, timer와 callback을 자동 검증하는 표면. component main story의 fixture와 meta를 재사용하되 component의 `Tests` 하위 title에서 실행한다.

`Default`와 `Base`를 형식적으로 모두 만들거나 같은 상태 조합을 Playground와 개별 story에 중복하지 않는다.

모든 일반 story는 render 검토 표면이다. 자동화가 렌더 결과를 읽기만 하거나 수동 입력과 겹치지 않는 setup만 수행하면 같은 story에 둘 수 있지만, `userEvent`, `fireEvent`, 직접 click·focus, timer와 callback 실행처럼 상태나 Actions 기록을 바꾸는 검증은 component의 `Tests` 하위 title로 분리한다. Tests story는 결정적인 args와 비활성화된 Controls를 사용하고, main story에서는 `excludeStories`로 숨긴 뒤 얇은 `*.tests.stories.tsx` wrapper에서 한 번만 노출한다. viewport collision, fallback tab stop, timer·교체·cleanup, 환경 전환 뒤 늦은 완료 같은 전용 fixture나 lifecycle 검증도 같은 Tests 경계를 사용한다.

### Page와 Screen

Page·Screen에는 Controls를 억지로 추가하지 않는다. 활성·비활성, loading·error·empty·data, 관계·권한 상태처럼 사용자가 구분할 수 있는 대표 시나리오를 story로 제공한다. route·data 정책을 바꾸지 않고 Production screen이 이미 지원하는 입력과 공용 mock으로만 구성한다.

각 DSN별 이슈에 적힌 Controls·Actions·play는 최소 요구사항이지 폐쇄 목록이 아니다. 구현 중 실제 Production 컴포넌트가 추가로 소유해야 할 상태·variant·callback·interaction이 확인되면 적절한 검증 표면에 포함할 수 있다.

## Controls, toolbar와 Actions

- Controls에는 Production 컴포넌트가 공개 prop 또는 controlled state로 실제 소유하는 값만 노출한다.
- 폭처럼 사용처 layout이 소유하는 값은 Production prop으로 추가하지 않고, 필요한 Playground에서 `containerWidth` 같은 fixture arg로 분리한다.
- 사용자가 보는 label, title, description, message, placeholder와 action 문구는 Playground에서 수정할 수 있게 한다. `style` 객체와 내부 구현 값은 Controls에서 제외한다.
- `theme`, viewport와 reduced motion처럼 Storybook 전역에서 관리하는 값은 toolbar와 viewport parameters를 사용한다. 같은 값을 component args로 중복하지 않는다.
- Relay fragment ref, route 객체, 내부 token과 구현 세부사항을 사람이 조절하는 Control로 노출하지 않는다.
- callback prop은 `storybook/test`의 `fn()` 등 Storybook spy를 args에 연결해 Actions에서 호출과 입력을 관찰할 수 있게 한다.
- 컴포넌트 내부에서만 발생하는 상태를 Control에 노출하기 위해 test-only prop을 추가하지 않는다. 사용자 interaction으로 도달하고 Tests story의 `play`에서 검증한다.

## `play` interaction

- Tests story의 `play`는 menu 열기·선택·dismiss, keyboard 이동, focus 복원, form validation·recovery처럼 component가 직접 소유하는 핵심 interaction을 검증한다.
- Playground의 `play`는 수동 Controls·Actions와 겹치지 않는 read-only assertion이나 setup에만 사용한다.
- 접근 가능한 role, name과 state로 요소를 찾고 `userEvent`를 우선 사용한다.
- 사용자가 관찰하는 결과와 callback을 검증한다. 내부 state, private 함수 호출 횟수나 DOM 구현 세부사항을 계약으로 고정하지 않는다.
- route navigation, network, mutation, cache와 권한 정책의 전체 동작은 대응 Product 테스트가 소유한다. Storybook에서는 component 경계의 callback과 표시 상태까지만 확인한다.

## 검증 표면

| 검증                   | 명령·표면                                               | 입증하는 것                                                     | 입증하지 않는 것                                                   |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Static build           | `pnpm --filter @kosmo/app build-storybook`              | 현재 head의 story와 asset이 정적 bundle로 생성됨                | story별 interaction, runtime 배포                                  |
| Storybook browser test | `pnpm --filter @kosmo/app test:storybook`               | Playwright Chromium에서 story render, `play`와 설정된 a11y 규칙 | iOS·Android, Production route·network                              |
| Accessibility          | addon a11y와 semantic assertion                         | 자동 검출 가능한 role, name, state와 규칙                       | 비활성화된 `color-contrast`, 전체 WCAG AA, 실제 screen reader 흐름 |
| Visual contract review | Figma와 대표 story 직접 비교                            | 상태·theme·viewport별 시각 계약 일치                            | 자동 pixel regression, Native runtime                              |
| Theme                  | Light·Dark toolbar와 필요한 대표 story                  | semantic theme에서의 시각·상태 계약                             | OS theme 전환과 Production persistence                             |
| Responsive             | 해당 surface에 등록된 mobile·compact·full 등 대표 story | React Native Web의 해당 viewport 배치                           | Native 기기, safe area, keyboard, 실제 reflow 전체                 |
| Manual interaction     | Playground Controls·Actions와 Storybook 직접 사용       | 사람이 조절한 component state와 callback                        | 자동 interaction 회귀                                              |
| Automated interaction  | Tests story의 `play`                                    | component-owned interaction과 callback 회귀                     | route·API·mutation·cache·권한 정책                                 |
| Production runtime     | 대응 Product 이슈의 Web·iOS·Android 검증                | 실제 플랫폼에서의 통합 동작                                     | Figma 또는 Storybook만으로 대체할 수 없음                          |

Storybook a11y는 `.storybook/preview.tsx`에서 `color-contrast`를 제외한다. 따라서 `test:storybook` 통과를 색상 대비를 포함한 전체 접근성 완료로 보고하지 않는다.

## 범위 확대 기준

- 기존 Production 컴포넌트가 이미 소유하는 상태·variant·callback·interaction 보강은 해당 DSN Storybook 이슈에서 진행할 수 있다.
- route, data, Relay, API, mutation, cache, 권한과 제품 정책은 대응 Product 이슈로 보낸다.
- 새 Production 컴포넌트, 제품 동작, dependency나 Storybook 설정이 필요하면 현재 이슈에서 조용히 확장하지 않고 대상 이슈·estimate·검증 책임을 먼저 확인한다.
- Storybook static·browser 증거와 Web·iOS·Android runtime 증거를 PR과 이슈에서 분리해 보고한다.
