## Context

이 기록은 PROD-797의 DSN-43 Production 동기화 범위와 기존 `post`·`web-app-shell` 계약, 현재 Production consumer 조사, proposal/spec/design을 바탕으로 구현 전에 유지할 선택을 정리한다.

## Decision Records

### Rail·desktop Overlay·모바일 전체 화면만 canonical 작성 surface로 사용

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/icons.md`, DSN-43, PROD-797
- Status: Active
- Context / Problem: Production은 Full Web Right Rail과 독립 `/compose` 화면을 사용하지만 canonical presentation은 Rail과 Overlay만 정의한다.
- Decision Outcome: Full Web은 Rail과 Expand desktop Overlay, compact Web은 icon rail trigger의 desktop Overlay, mobile Web·Android·iOS는 하단 탭 trigger의 전체 화면 composer를 사용한다.
- Alternatives Considered: 중앙 timeline inline composer와 독립 `/compose` presentation은 canonical 계약이 아니므로 사용하지 않는다.
- Consequences: navigation chrome의 시각 계약은 바꾸지 않고 shell의 compose action만 host open action으로 연결한다.
- Confirmation / Follow-up: Full·compact·mobile 진입과 중복 진입점 부재를 component 및 runtime에서 검증한다.

### 작성 controller를 presentation보다 위에서 한 번만 소유

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-797
- Status: Active
- Context / Problem: Rail과 Overlay를 별도 `PostComposer` instance로 렌더링하면 draft, 진행 중 upload, pending/error와 actor context가 분리된다.
- Decision Outcome: 기존 작성 상태·Media upload·`createPost` owner를 한 번만 유지하고 Rail, Overlay와 모바일 presentation을 그 owner의 view로 전환한다. 새 controller, 전역 draft store 또는 상태 머신은 추가하지 않는다.
- Alternatives Considered: surface별 composer mount와 별도 전역 store는 상태 중복과 새 lifecycle을 만들므로 선택하지 않는다.
- Consequences: breakpoint와 editor 전환에서도 같은 draft를 유지하며, Profile/actor 변경은 기존 context isolation으로 owner를 교체한다.
- Confirmation / Follow-up: Rail → Overlay, close → reopen, resize와 Profile 전환 시 draft·upload·오류 격리를 실행 검증한다.

### Media editor는 같은 상위 Overlay의 내부 view로 전환

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/figma.md`, `docs/design/accessibility.md`, `docs/design/icons.md`, DSN-43, PROD-797
- Status: Active
- Context / Problem: Storybook editor를 별도 modal로 옮기면 scrim과 modal semantics, focus lifecycle이 중첩된다.
- Decision Outcome: Media editor 진입 시 같은 parent Overlay 안의 composer content를 editor로 교체한다. Back/Done은 composer로 돌아가고 Close만 parent Overlay 전체를 닫는다.
- Alternatives Considered: 별도 `ModalSheet` 또는 두 번째 scrim은 canonical parent ownership과 충돌하므로 사용하지 않는다.
- Consequences: editor 폭은 parent surface가 조정하고, draft·Media 상태·focus dismiss는 하나의 Overlay lifecycle을 공유한다.
- Confirmation / Follow-up: Web/Native에서 modal semantic surface가 하나인지, Back·Done·Close가 서로 다른 결과를 내는지 검증한다.

### 미구현 Composer action은 Production에서 숨김

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/figma.md`, DSN-43, PROD-797
- Status: Active
- Context / Problem: 공용 target은 완성형 specimen을 위해 Poll·Emoji action을 기본 노출하지만 Product capability는 아직 없다.
- Decision Outcome: Production adapter는 Poll·Emoji와 이미지 crop·회전·초점 action을 노출하지 않고 Media·Content Warning·기존 visibility와 submit만 연결한다.
- Alternatives Considered: no-op 또는 disabled control 노출은 준비되지 않은 기능을 제품 기능처럼 보이게 하므로 제외한다.
- Consequences: 후속 기능은 각 authority와 capability가 준비된 별도 변경에서 활성화한다.
- Confirmation / Follow-up: Production render와 접근성 트리에 미구현 action이 없는지 검증한다.

### 직접 `/compose` route 제거와 bare `compose` 예약 handle 유지

- Decision Date: 2026-09-13
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/domain/objects/profile.md`, DSN-43, PROD-797
- Status: Active
- Context / Problem: canonical 작성 surface는 shell에서 여는 Rail·Overlay이며 direct `/compose`는 retired route다. route namespace를 반환하면 Local Profile handle과 충돌할 수 있다.
- Decision Outcome: direct `/compose` compatibility route는 제공하지 않으며 직접 접근은 404가 될 수 있다. Full·compact·mobile shell trigger만 Production composer host를 연다. route 제거 뒤에도 bare `compose`는 앞뒤 공백 제거·소문자 비교 기준의 Local Profile System Reserved Handle로 영구 예약하고, Remote Profile handle에는 이 정책을 적용하지 않는다.
- Alternatives Considered: direct URL을 host-opening adapter나 redirect로 유지하는 방식은 retired route 계약과 충돌한다. `compose`를 Local Profile에 허용하는 방식은 route namespace 재사용을 허용하므로 제외한다.
- Consequences: 기존 `/compose` deep link는 404가 될 수 있고 direct URL의 close·success fallback은 계약하지 않는다. shell이 연 surface의 close·success lifecycle과 draft 보존은 별도 composer host 계약을 따른다.
- Confirmation / Follow-up: route-removal 구현에서 direct 접근이 composer를 렌더링하지 않는지 확인하고, 기존 Local Profile reserved-handle 계약에서 bare `compose` 거부가 유지되는지 대조한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
