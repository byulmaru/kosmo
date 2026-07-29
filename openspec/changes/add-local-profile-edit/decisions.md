## Context

이 기록은 `PROD-490`, `PROD-491`, `PROD-492`와 canonical Profile edit 문서에서 승인한 presentation·route·권한
경계를 반영한다. Profile Tag 저장·공개 표시는 별도 계약이 소유하지만 Follow Approval Policy는 현재 Profile
편집 draft/save 경계에 포함하고, Settings 진입점이 제공되면 `PROD-531`이 제어를 이전한다.

## Decision Records

### 실제 Profile edit route는 selected Local Owner 검증 뒤에만 제공한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`,
  `PROD-492`
- Status: Active
- Context / Problem: client의 selected Profile id와 Local origin만으로 Membership Owner를 판정할 수 없어 UI-only
  route가 직접 URL로 권한 없는 사용자에게 노출될 수 있다.
- Decision Outcome: protected `/profile-edit` route와 production entrypoint는 usingProfile 경계의 selected
  Active/Normal Local Profile과 Owner Membership을 server-authoritative하게 확인하고 초기값·submit까지 연결할 때만
  제공한다.
- Alternatives Considered: Local origin을 client-side 권한으로 사용하는 방식은 Member와 Owner를 구분하지 못해
  제외했다. UI slice에 disabled route를 먼저 두는 방식은 직접 URL 노출과 성공 가능성 오해가 있어 제외했다.
- Consequences: `PROD-491`은 route 파일을 만들지 않고 `PROD-492`가 권한·route·저장을 함께 검증한다.
- Confirmation / Follow-up: Owner·Member·무관 Account와 직접 URL 진입을 API·route integration에서 검증한다.

### Profile edit presentation은 controlled component로 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-491`, `PROD-527`
- Status: Active
- Context / Problem: UI를 API 전에 검증하면서도 route·Relay·Media와 Tag 저장 흐름을 중복 구현하지 않아야 한다.
- Decision Outcome: `ProfileEditScreen`·`ProfileEditForm`은 값, validation, image state, save state와 optional callback을
  controlled prop으로 받고 Expo Router·Relay를 직접 읽지 않는다. callback이 없으면 저장을 disabled로 둔다.
  Profile Tag editor도 같은 presentation에 한 번만 만들고 `PROD-527`이 연결한다.
- Alternatives Considered: route component 안에 form state와 mutation을 함께 두는 방식은 UI-only slice와 Storybook
  검증을 불가능하게 해 제외했다. Tag editor를 PROD-527에서 재작성하는 방식은 interaction·접근성 계약을
  중복시켜 제외했다.
- Consequences: controlled state catalog가 production wiring과 독립적으로 존재하며 후속 modal wrapper도 form을
  재사용할 수 있다.
- Confirmation / Follow-up: Storybook state와 후속 integration test에서 같은 component boundary를 사용하는지
  확인한다.

### 변경하지 않은 avatar와 header는 현재 값을 암묵적으로 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`
- Status: Active
- Context / Problem: 현재 이미지를 유지하기 위해 별도 action을 선택하게 하면 form의 초기값과 사용자의 실제
  변경 의도가 중복되고, header와 avatar 중 하나만 바꾸는 일반적인 흐름이 불필요하게 복잡해진다.
- Decision Outcome: 현재 avatar와 header를 각 field의 초기 draft로 표시하고 별도의 `유지` action이나 두 이미지를
  묶은 action row를 두지 않는다. 각 preview의 편집 control은 해당 field draft만 변경하며 건드리지 않은 이미지는
  현재 값으로 남는다. 저장은 사용자가 원하는 field를 편집한 뒤의 현재 draft를 제출한다.
- Alternatives Considered: 두 이미지 공통 `유지`·`교체`·`제거` row는 field별 대상이 모호하고 초기값을 다시
  확인하게 해 제외했다. 각 이미지 옆에 `유지` 버튼을 두는 방식도 아무 변경이 없는 상태를 action처럼 보여 제외했다.
- Consequences: 초기 상태는 dirty가 아니며 submit callback이 없거나 어떤 field도 바뀌지 않았으면 저장을 disabled로
  표현한다. 교체·제거·업로드 상태는 header와 avatar의 개별 편집 흐름에서 표현한다.
- Confirmation / Follow-up: 한 이미지 field만 편집했을 때 다른 이미지 draft가 그대로이고, Figma와 Storybook에
  공통 유지 action row가 없는지 확인한다.

### Web Profile edit는 shell 중앙 dedicated route를 사용한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `PROD-491`, `PROD-492`
- Status: Active
- Context / Problem: 모바일 시안만 있는 상태에서 desktop을 modal 또는 route 중 어떤 surface로 제공할지 정해야
  shell breakpoint와 navigation을 일관되게 설계할 수 있다.
- Decision Outcome: Web은 기존 shell 안의 최대 600px 중앙 dedicated route를 사용한다. 1440은 full sidebar·right
  rail 사이, 1024는 icon rail 다음에 놓고 form의 정보 구조는 mobile/native와 공유한다.
- Alternatives Considered: modal은 future wrapper로 허용하지만 현재 navigation과 긴 form을 담는 primary surface로는
  사용하지 않는다. 독립 desktop-only route tree는 universal Expo Router 계약을 깨므로 제외했다.
- Consequences: 중앙 action은 sticky할 수 있지만 document scroll 소유권을 유지하고 별도 breakpoint를 만들지 않는다.
- Confirmation / Follow-up: 390, 1024, 1440 catalog와 Figma frame에서 shell 배치와 wrapping을 확인한다.

### Header 이미지 변경 영역은 모든 폭에서 3:1을 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `PROD-491`
- Status: Active
- Context / Problem: header preview와 avatar·action을 포함한 hero wrapper를 같은 고정 높이로 취급하면 mobile과
  desktop의 서로 다른 surface 폭에서 이미지 변경 영역의 비율이 달라진다.
- Decision Outcome: 실제 header 이미지 preview layer는 모든 지원 폭에서 가로:세로 `3:1`을 유지한다.
  avatar overlap과 편집 action은 별도 hero wrapper에 배치하고, 다른 비율의 원본은 preview 경계 안에서 중앙
  기준 cover crop한다.
- Alternatives Considered: mobile·desktop별 고정 높이는 중간 폭에서 다시 왜곡되므로 제외했다. hero wrapper
  전체를 `3:1`로 고정하면 avatar overlap 공간까지 이미지 비율에 포함되어 제외했다.
- Consequences: `390px` preview는 `390×130`, `600px` preview는 `600×200`이며 임의 폭에서는 높이를
  `width / 3`으로 계산한다. wrapper의 추가 높이는 preview 비율을 바꾸지 않는다.
- Confirmation / Follow-up: Figma ratio lock과 component/Storybook에서 390·600·중간 폭의 계산된 크기를
  검증한다.

### Follow Approval Policy는 현재 Profile edit draft/save가 소유하고 PROD-531에서 Settings로 이전한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`,
  `PROD-491`, `PROD-492`, `PROD-531`
- Status: Active
- Context / Problem: Settings 진입점이 아직 없어 정책 제어를 다른 화면으로 옮길 수 없고, 현재 Profile 편집에서
  표시 이름·소개·Media와 함께 사용자가 한 번에 저장할 정책 draft 경계가 필요하다.
- Decision Outcome: Profile edit는 한 줄 `팔로우 요청 자동 승인` Switch를 controlled `followPolicy` enum draft로
  제공한다. Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`로 제출하며 displayName·bio·avatar/header와 같은
  저장 callback·transaction에 포함한다. 정책 변경은 기존 Pending Follow Request의 상태나 존재를 바꾸지 않는다.
  Settings 진입점이 제공되면 `PROD-531`이 이 제어와 저장 소유권을 Settings로 이전하고 Profile edit의 중복
  제어를 제거한다.
- Alternatives Considered: Switch 변경 때 별도 즉시 저장을 실행하는 방식은 draft 전체의 원자적 저장과 실패 뒤
  재시도 경계를 깨므로 제외했다. 정책만 별도 mutation seam으로 분리하는 방식도 text·Media와 저장 소유권과
  오류 처리를 중복시켜 제외했다. Settings 이전은 현재 저장을 분리하는 근거가 아니라 `PROD-531`에서 한 번에
  소유권을 옮기는 후속 경계로 둔다.
- Consequences: `PROD-491`은 enum draft·Switch·dirty/disabled 상태와 동일 submit callback을 표현하고,
  `PROD-492`는 초기값 조회와 text·Media·policy 저장을 함께 연결한다. `PROD-531` 완료 뒤에는 Profile edit
  control과 저장 계약에서 policy를 제거한다.
- Confirmation / Follow-up: Switch 토글만으로 dirty가 되고 정확한 enum이 같은 save callback에 전달되는지,
  저장 실패 뒤 draft가 보존되는지, 정책 변경이 기존 Pending Follow Request를 바꾸지 않는지 검증한다.

### Profile Tag 제거 action은 시각 크기와 플랫폼 target을 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-491`
- Status: Active
- Context / Problem: 모든 플랫폼에 공통 `44×44` target을 적용하면 Web form의 밀도를 불필요하게 낮추면서
  Android의 `48dp` 기준에는 미달한다. 반대로 공통 `32×32`는 Native 입력 target을 충족하지 못한다.
- Decision Outcome: Profile Tag 제거 action은 시각 크기 `32×32`를 유지하고 실제 입력 target은 Web
  `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`로 제공한다. text action은 최소 높이 `36`을 사용한다.
  Profile Tag는 추가·제거만 제공하고 순서 변경 control이나 drag gesture를 제공하지 않는다.
- Alternatives Considered: 모든 플랫폼에 공통 `44×44`를 강제하는 방식과 Native target 검증을 후속으로
  미루는 방식은 플랫폼 기준과 현재 구현 계약을 동시에 충족하지 못해 제외했다.
- Consequences: 공용 component에서 compact visual과 platform별 실제 입력 target을 분리하고 제거 action의
  접근성 label/state를 유지한다.
- Confirmation / Follow-up: Storybook에서 Web `32×32 CSS px` target을 검증하고 iOS `44×44 pt`, Android
  `48×48 dp` mapping을 구현한다. Native 실제 기기 검증은 route 통합 단계에서 수행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
