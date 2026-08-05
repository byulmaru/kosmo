## Context

이 기록은 `docs/design/settings.md`와 최신 Linear `PROD-645`, `PROD-685`, `PROD-684`의 Account 외부
진입점·소유권 계약을 대조한 결과다. `PROD-653`은 완료된 선행 정보 구조 산출물로 기록하며 active 통합·archive
owner로 취급하지 않는다.

## Decision Records

### canonical Account Settings URL은 external Link의 href로만 사용한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-645`
- Status: Active
- Context / Problem: Kosmo 내부 route나 추론한 provider subpath를 사용하면 Account Settings의 서비스 소유
  경계가 흐려진다.
- Decision Outcome: Account 행은 `https://id.byulmaru.co`를 Expo Router `Link`의 exact external `href`로
  사용한다. Kosmo 내부 Account route, generic placeholder, query가 붙은 URL 또는 추론한 `/settings` subpath를
  사용하지 않는다.
- Alternatives Considered: Kosmo `/settings/account` route, provider `/settings` subpath, runtime discovery로
  URL을 조립하는 방식. 현재 canonical authority가 없어 채택하지 않았다.
- Consequences: destination 변경은 canonical 디자인과 PROD-645 계약을 먼저 갱신한다. navigation 결과와
  provider redirect는 브라우저·OS가 소유한다.
- Confirmation / Follow-up: component test와 Storybook에서 exact href와 실제 link semantics를 확인하고,
  production route 조립은 `PROD-685`가 검증한다.

### 시각 label과 accessible name으로 서로 다른 소유 정보를 전달한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645`
- Status: Active
- Context / Problem: 시각적으로 `Byulmaru ID 계정 설정`을 반복하면 평면 정보 구조의 generic section label을
  대체하고, `계정 설정`만 사용하면 외부 서비스 소유권이 보조기술에 전달되지 않는다.
- Decision Outcome: 시각 label은 `계정 설정`, accessible name은 `Byulmaru ID Account Settings 외부 서비스로
이동`으로 둔다. 전체 행이 하나의 link target이며 chevron은 장식 요소다.
- Alternatives Considered: 시각 label에 owner를 반복하거나, 별도 owner label·설명 block 또는 chevron button을
  추가하는 방식. 정보 구조와 focus target을 중복하므로 채택하지 않았다.
- Consequences: 부모 shell은 시각 label·owner 설명을 다시 만들지 않는다. accessible name과 canonical href는
  Byulmaru ID 외부 Account Settings 의미를 함께 유지해야 한다.
- Confirmation / Follow-up: component/Storybook accessibility tree에서 visible label, link role, accessible
  name, href와 chevron의 focus target 부재를 확인한다.

### 모든 플랫폼에서 Expo Router external Link가 navigation 경계를 소유한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `PROD-645`
- Status: Active
- Context / Problem: component가 Platform·Linking API와 JS 상태를 소유하면 browser·OS의 실제 link 의미와
  modifier, 새 탭, 주소 복사 및 native external flow를 가로채게 된다.
- Decision Outcome: `Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}`와 row UI만 유지한다. component에는
  JS `onPress`, Platform/Linking, URL support check, navigation success/failure, loading/error/retry/lock
  상태와 helper를 두지 않는다. focus-visible 표시를 위한 local `useState`와 `onFocus`/`onBlur`는 plain static
  style object를 만들기 위해 허용한다.
- Alternatives Considered: `Linking.canOpenURL/openURL`, custom `onPress`, child-local error/retry state,
  platform별 branch. browser·OS navigation lifecycle을 중복 소유하므로 채택하지 않았다.
- Consequences: Kosmo는 외부 이동 결과를 확인·복구·잠금하지 않는다. 단위 테스트와 Storybook은 실제 외부 이동을
  실행하지 않고 정적 link semantics를 검증한다.
- Confirmation / Follow-up: unit test에서 child custom JS `onPress`와 navigation 상태 요소가 없음을 확인하고,
  Storybook에서 focus와 href만 확인한다.

### 구현·통합·archive 소유권을 분리한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-645`, `PROD-685`, `PROD-684`, `PROD-653`
- Status: Active
- Context / Problem: 선행 정보 구조 산출물 또는 child 구현 PR의 존재만으로 production 통합·OpenSpec archive
  책임을 추론할 수 없다.
- Decision Outcome: `PROD-645`는 concrete Account Link child와 그 기능 계약을 소유한다. `PROD-685`는
  production `/settings` route/navigation, `PROD-645`·`PROD-667` child 조립과 page-level 검증을 소유한다.
  `PROD-684`는 최종 Settings 통합과 전체 OpenSpec 완료·archive 판단을 소유한다. `PROD-653`은 완료된 선행
  정보 구조 산출물이다.
- Alternatives Considered: `PROD-653`이 계속 active integration/archive owner가 되거나, child PR 완료만으로
  change archive를 판단하는 방식. 현재 Linear ownership과 완료 gate를 반영하지 못해 채택하지 않았다.
- Consequences: child handoff, page-level 검증과 최종 archive 증거를 각각 해당 owner가 제공한다.
- Confirmation / Follow-up: tasks와 proposal에 동일한 owner mapping을 유지하고, `PROD-684`가 전체 scope와
  delta spec 정합성을 최종 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### 외부 이동을 child-local 지원 확인·오류·재시도로 소유한다 (Superseded)

- Original Decision Date: 2026-08-04
- Original Outcome: `Linking.canOpenURL`·`openURL` 호출, 지원 불가·rejection 오류 표시, retry·loading·lock
  상태를 component가 소유한다.
- Superseded Date: 2026-08-05
- Superseded By: `모든 플랫폼에서 Expo Router external Link가 navigation 경계를 소유한다`
- Reason: 최신 `PROD-645`는 browser·OS가 external navigation을 소유하고 Kosmo가 URL support, success/failure,
  loading/error/retry/lock 상태를 소유하지 않도록 계약을 변경했다.

### PROD-653이 production 통합·archive를 소유한다 (Superseded)

- Original Decision Date: 2026-08-04
- Original Outcome: `PROD-653`이 child를 `/settings`에 통합하고 page-level 검증 및 OpenSpec archive를 소유한다.
- Superseded Date: 2026-08-05
- Superseded By: `구현·통합·archive 소유권을 분리한다`
- Reason: 최신 Linear ownership은 `PROD-685`를 production route/navigation과 child assembly/page-level 검증 owner로,
  `PROD-684`를 final Settings integration과 OpenSpec completion/archive owner로 지정한다.
