## Context

이 기록은 `docs/design/settings.md`, `docs/design/accessibility.md`와 최신 Linear `PROD-645`·`PROD-653`의
Account 외부 진입점 계약을 독립 대조한 결과를 반영한다. 제품 소유 경계와 관찰 가능한 동작은 upstream을
재서술하고, 그 범위 안에서 플랫폼 공용 구현과 실패 복구 방식을 선택한다.

## Decision Records

### Byulmaru ID root를 Account Settings의 유일한 외부 destination으로 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-645`
- Status: Active
- Context / Problem: Kosmo 내부 route나 추론한 provider subpath를 사용하면 Account Settings의 서비스 소유
  경계가 흐려지거나 존재하지 않는 destination으로 이동할 수 있다.
- Decision Outcome: Account 진입점은 `https://id.byulmaru.co`만 외부로 연다. Kosmo 내부 Account route,
  generic placeholder, query가 붙은 URL 또는 추론한 `/settings` subpath를 사용하지 않는다.
- Alternatives Considered: Kosmo `/settings/account` route, provider `/settings` subpath, runtime OIDC discovery
  결과로 Account UI URL을 조립하는 방식. 현재 canonical·Linear authority가 없거나 실제 endpoint와 맞지 않아
  채택하지 않았다.
- Consequences: destination 변경은 코드 상수만 임의 수정하지 않고 canonical 디자인과 PROD-645 계약을 먼저
  갱신해야 한다. Kosmo는 provider 인증 뒤 redirect destination을 소유하지 않는다.
- Confirmation / Follow-up: exact URL unit test와 Web·Android·iOS 외부 이동 검증에서 내부 Router가 호출되지
  않는지 확인한다.

### 소유권과 외부 이동 의미를 하나의 평면 Account 행에 담는다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645`
- Status: Active
- Context / Problem: 별도 heading·소유자 설명을 추가하면 승인된 평면 정보 밀도를 깨뜨리고, generic `계정
  설정`만 표시하면 Byulmaru ID 외부 서비스라는 사실을 전달하지 못한다.
- Decision Outcome: 시각 label은 `Byulmaru ID 계정 설정`, accessible name은 `Byulmaru ID 계정 설정, 외부
  서비스로 이동`을 사용한다. 전체 행이 하나의 link target이며 chevron은 장식 요소로만 표시한다.
- Alternatives Considered: `계정 설정` generic label, 별도 `Byulmaru ID` owner label과 설명, chevron을 별도
  button으로 만드는 방식. 각각 서비스 경계를 숨기거나 중복 block·focus target을 만들므로 채택하지 않았다.
- Consequences: 부모 shell은 child 주변에 `계정 설정` heading·owner copy를 덧붙이지 않는다. copy가 바뀌어도
  Byulmaru ID, Account 수준 설정과 외부 이동 의미를 모두 보존해야 한다.
- Confirmation / Follow-up: component/Storybook accessibility tree에서 link role, accessible name, chevron의
  focus target 부재와 Account/Profile 순서를 확인한다.

### 외부 이동 확인과 실행 실패를 child-local retry 상태로 처리한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645`
- Status: Active
- Context / Problem: 외부 handler가 없거나 navigation API가 거부될 수 있으며 Promise rejection을 버리면
  사용자가 실패를 알거나 복구할 수 없다. 반대로 page-wide boundary는 정상인 Profile 기능까지 숨긴다.
- Decision Outcome: 한 action 안에서 canonical URL의 지원 여부를 확인하고 지원될 때만 외부 이동을 실행한다.
  어느 단계든 실패하면 `Byulmaru ID 계정 설정을 열지 못했어요.`와 `다시 시도`를 Account child 가까이에
  표시한다. 재시도는 동일한 확인과 이동을 반복하고 성공하면 오류를 제거한다.
- Alternatives Considered: `openURL` fire-and-forget, page-wide error boundary, toast만 표시하고 retry를
  제공하지 않는 방식. 실패 관찰·재시도 또는 독립 오류 경계를 충족하지 않아 채택하지 않았다.
- Consequences: child는 작은 interaction state를 소유하지만 Account 데이터 loading·save state는 만들지 않는다.
  같은 오류를 alert와 toast로 중복 announce하지 않는다.
- Confirmation / Follow-up: can-open false/rejection, open rejection, retry success와 중복 announcement를 unit
  test와 Storybook interaction으로 검증한다.

### PROD-645는 concrete child를 전달하고 PROD-653이 production page에 통합한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-645`, `PROD-653`
- Status: Active
- Context / Problem: parent settings shell과 route가 아직 production component로 존재하지 않는 상태에서
  PROD-645가 page shell을 만들면 두 이슈의 책임이 합쳐지고 임시 slot API가 다시 생긴다.
- Decision Outcome: PROD-645는 concrete Account 외부 진입점, navigation·오류 복구와 기능 검증을 소유한다.
  PROD-653은 이 child를 `/settings` 첫 행에 직접 통합하고 route·Profile content·page-level 플랫폼 검증을
  소유한다.
- Alternatives Considered: PROD-645가 `/settings` 전체와 route navigation을 함께 구현하는 방식, parent가
  callback/ReactElement slot만 먼저 공개하는 방식. Linear 소유권을 침범하거나 제거된 임시 조립 경계를
  복원하므로 채택하지 않았다.
- Consequences: PROD-645 branch의 standalone catalog는 통합 가능한 결과지만 production 노출 증거는 아니다.
  PROD-653 완료와 `add-settings-page-shell` archive는 두 child 통합 이후에만 가능하다.
- Confirmation / Follow-up: PROD-645 diff에 route·page shell·Profile 구현이 없는지, PROD-653 통합에서 concrete
  child가 첫 번째 Account 행으로 사용되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
