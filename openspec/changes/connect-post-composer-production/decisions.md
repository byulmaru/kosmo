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
- Consequences: navigation chrome의 시각 계약은 바꾸지 않고 compose destination의 Production 동작만 host open action으로 연결한다.
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

### `/compose` 호환과 미완성 draft close 정책

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-797
- Status: Active
- Context / Problem: `/compose`는 deep link 호환이 필요하지만 별도 composer 구현은 허용되지 않으며, close destination과 미완성 draft 처리의 최소 동작이 필요하다.
- Decision Outcome: `/compose`는 같은 Production composer host에 위임한다. 제출하지 않고 닫을 때 history가 있으면 back, 없으면 Home으로 이동한다. 같은 Profile lifecycle에서 닫았다 다시 열면 draft를 보존하며 새 discard confirmation은 추가하지 않는다.
- Alternatives Considered: `/compose` 전용 composer는 상태를 복제하므로 제외한다. 항상 Home 이동은 유효한 이전 화면을 버리고, 새 discard confirmation은 승인된 범위보다 정책과 UI를 늘리므로 선택하지 않는다.
- Consequences: 기존 URL과 session/profile query 경계를 유지하면서 route는 얇아진다. draft는 게시 성공 또는 기존 actor/session lifecycle이 초기화할 때까지 유지된다.
- Confirmation / Follow-up: history 유무에 따른 close, close → reopen draft 보존, Web 현재 route 유지와 모바일 성공 후 Home을 E2E/runtime에서 검증한다.

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

### desktop Overlay 외곽은 상태와 무관하게 유지

- Decision Date: 2026-09-12
- Decision Class: Human Decision
- Authority / Provenance: `docs/design/figma.md`, `docs/design/breakpoints.md`, PROD-797, 2026-09-12 작성 화면 검토
- Status: Active
- Context / Problem: CW나 Media 추가로 자연 높이가 늘어나는 중앙 모달은 위·아래 경계와 header·footer가 함께 이동해 작성 흐름이 불안정하게 보인다.
- Decision Outcome: desktop Overlay의 `PostComposer`는 가용 높이에서 Empty source의 404px 외곽 높이를 유지하고, 짧은 viewport에서는 Host의 85dvh 안으로 줄어든다. author와 editor header·footer는 고정하고 body·CW·Media가 가운데 영역을 나눠 쓰며, 넘치는 내용만 그 영역에서 scroll한다.
- Alternatives Considered: 상태에 따라 모달 전체를 키우는 현재 방식과 Mastodon처럼 바깥 작성 패널 자체를 scroll하는 방식은 중앙 modal에서 외곽 이동을 남기므로 선택하지 않는다. 더 큰 고정 높이는 Empty 상태에 불필요한 여백을 추가하므로 사용하지 않는다.
- Consequences: Media 상태에서는 본문 최소 높이가 줄고 가운데 영역에 scroll이 생길 수 있다. Rail·모바일 전체 화면과 Figma 원본은 변경하지 않는다.
- Confirmation / Follow-up: Empty·CW·Media 전환 전후 외곽과 고정 영역 geometry, 가운데 overflow scroll을 실제 Web Overlay에서 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
