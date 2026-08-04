## Context

`PROD-653`의 canonical `docs/design/settings.md`와 `add-settings-page-shell`은 `/settings`의 평면 정보 구조와
통합 책임을 소유하지만, child가 없는 상태에서 만든 임시 `SettingsPage` slot API는 제거된 상태다. PROD-645는
이 shell이 나중에 직접 조립할 수 있는 concrete Account 외부 진입점과 그 navigation·오류 상태만 제공해야
한다. 현재 앱은 Android·iOS·Web이 같은 React Native component tree를 사용하고, `react-native`의 `Linking`
경계와 `lucide-react-native`, theme token, Node component test와 React Native Web Storybook을 이미 사용한다.

## Goals / Non-Goals

**Goals:**

- Byulmaru ID Account Settings의 label, canonical URL, 플랫폼별 외부 이동과 재시도를 하나의 concrete child에
  캡슐화한다.
- 평면 Account 행, 외부 이동 chevron, link semantics와 플랫폼 target 기준을 제공한다.
- 외부 이동 실패를 child 가까이에서 복구하고 부모 page heading과 Profile 기능에 오류를 전파하지 않는다.
- PROD-653이 별도 wrapper나 임시 slot 계약 없이 이 concrete child를 settings page에 통합할 수 있게 한다.

**Non-Goals:**

- `/settings` route, page heading, Profile identity/control, sidebar·rail·drawer navigation 구현
- Kosmo Account 데이터 query·form·save와 내부 Account route
- Byulmaru ID 화면 또는 인증·OAuth/session 계약 변경
- PROD-653 `add-settings-page-shell`의 task 완료나 archive

## Implementation Guidance

### Current Constraints

- parent branch에는 production `SettingsPage`가 없으므로 PROD-645에서 page shell이나 route를 다시 만들면
  PROD-653 소유 범위를 침범한다. standalone child와 독립 catalog/test가 현재 slice의 통합 가능한 결과다.
- Web과 Native를 하나의 component로 유지하되, navigation은 Expo Router의 내부 route가 아니라 운영체제·
  browser 외부 URL 경계를 사용해야 한다.
- `Linking.openURL()`만 호출하고 rejection을 버리면 완료 조건의 지원 불가·실패·재시도를 검증할 수 없다.
- 외부 이동 오류는 Account 데이터 오류가 아니며 page-wide error boundary로 승격해서는 안 된다.

### Recommended Approach

- `apps/app`의 settings component 영역에 stateful concrete Account entry component를 둔다. public prop은 parent
  layout이 필요한 범위로 제한하고 canonical URL이나 navigation callback을 caller가 주입하게 하지 않는다.
- 시각 label은 `Byulmaru ID 계정 설정`, accessible name은 `Byulmaru ID 계정 설정, 외부 서비스로 이동`을
  기본 copy로 사용한다. 전체 행은 Web에서 canonical `href`를 가진 Expo Router 외부 `Link`와 `Pressable`을
  결합하고 Native에서는 `link` role의 `Pressable`로 렌더링하며, 우측에는 `ChevronRight`만 둔다.
- Web의 수정자·보조 버튼 동작은 실제 anchor의 browser 기본 동작에 맡긴다. 평범한 활성화와 Native action은
  `Linking.canOpenURL('https://id.byulmaru.co')`를 확인한 뒤 true일 때만 같은 URL로 `Linking.openURL()`을
  실행한다. 확인 또는 이동이 실패하면 platform 원문을 버리고 child 내부 error state로 전환한다.
- 오류에는 `Byulmaru ID 계정 설정을 열지 못했어요.`와 별도 button role의 `다시 시도`를 제공한다. 재시도는
  동일한 확인→이동 순서를 다시 수행하고 성공하면 오류를 제거한다.
- 이동 중에는 중복 실행을 막고 link의 busy/disabled 상태를 노출한다. 재시도 중에는 오류 container와 같은
  retry focus target을 mount 상태로 유지한다. Web retry는 busy 상태와 instance-local 잠금으로 focus를
  유지하고 Native retry는 busy/disabled 상태를 노출한다. 오류 container는 live region 또는 alert
  semantics로 한 번만 announce하고 Profile content를 가리지 않는다.
- component unit test는 지원 가능·지원 불가·확인 rejection·open rejection·재시도 성공, exact URL과 Web
  anchor·수정자 동작·재시도 pending semantics를 검증한다. Storybook은 keyboard 외부 이동과 실패→재시도
  focus 유지 상태를 catalog하고 Web interaction/a11y를 확인한다.

### Allowed Alternatives

- `react-native` `Linking`과 동일한 HTTPS 외부 이동·지원 확인·오류 계약을 보존하는 기존 승인 wrapper가 구현
  시점에 존재하면 사용할 수 있다. caller가 canonical URL 또는 오류 처리 책임을 소유하게 만드는 범용 slot은
  허용하지 않는다.

### Known Traps

- absolute canonical URL이 아닌 Expo Router 내부 `href`로 처리해 Kosmo route 또는 SPA fallback으로 보내지
  않는다. Web의 실제 외부 anchor를 JS-only `Pressable`로 대체하지 않는다.
- `void Linking.openURL(...)`처럼 Promise rejection을 버리거나 `canOpenURL=false`를 성공으로 처리하지 않는다.
- Web에서 native 전용 browser API를 직접 import하거나 공용 component에서 `window`를 읽지 않는다.
- chevron을 별도 focus target으로 만들거나 Profile control에 같은 이동 affordance를 복제하지 않는다.
- error message에 exception, OS handler 목록 또는 URL 검사 원문을 포함하지 않는다.

## Risks / Trade-offs

- [Web의 `canOpenURL`은 HTTPS에 대해 실질적으로 항상 true를 반환한다] → Web은 정상 browser navigation과
  `openURL` rejection을 검증하고, unsupported-handler 분기는 Android·iOS unit/runtime 검증으로 소유한다.
- [외부 provider가 root route의 인증 후 destination을 변경할 수 있다] → Kosmo는 Linear가 승인한 origin만
  상수로 사용하고 query/path를 추론하지 않는다. URL 변경은 canonical·Linear를 먼저 갱신한다.
- [이 branch만으로 production `/settings`에서 보이지 않는다] → PROD-645는 concrete child와 기능 검증을
  전달하고, PROD-653이 child 결과를 직접 통합해 route/page-level 완료 증거를 소유한다.

## Migration Plan

1. 기존 route나 navigation을 노출하지 않은 채 concrete child, unit test와 Storybook 상태를 배포 가능한
   artifact로 만든다.
2. PROD-653 branch가 PROD-645 결과를 settings page의 첫 번째 Account 행으로 통합한다.
3. 통합 전에는 사용자에게 새 진입점이 노출되지 않으므로 rollback은 PROD-645 component 사용을 제거하는
   것으로 충분하다. 별도 데이터 migration이나 backend rollback은 없다.

## Open Questions

없음.
