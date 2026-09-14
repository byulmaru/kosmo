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

### desktop Composer는 내용만큼 늘어나고 surface별 최대 높이에서 내부 scroll

- Decision Date: 2026-09-14
- Decision Class: Human Decision
- Authority / Provenance: `docs/design/figma.md`, `docs/design/breakpoints.md`, PROD-797, 2026-09-14 사용자 화면 피드백
- Status: Active
- Supersedes: 2026-09-14 Human Decision `desktop Overlay는 Media 전후 560px로 고정하고 Rail만 Media 상태에 따라 확장` (아래 `Superseded Decisions`)
- Context / Problem: 공통 flex-fill wrapper가 빈 desktop Overlay도 최대 높이까지 늘리고, 고정 외곽 높이는 짧은 내용과 Media 전환에서 불필요한 여백을 만든다. Rail과 Overlay는 draft owner를 공유하지만 geometry까지 공유할 필요는 없다.
- Decision Outcome: desktop Rail·Overlay는 본문·Media·CW content를 따라 늘어난다. Rail은 `420px`, Overlay는 viewport 상·하 `48px` gutter를 제외한 높이를 각각 독립적인 외곽 상한으로 사용하고, 상한 이후 body·Media만 가운데 scroller에서 scroll한다. Overlay는 `640px` 폭으로 상단 `48px`에 배치한다. 모바일 전체 화면과 Media editor의 fill 구조는 유지한다.
- Alternatives Considered: Overlay `560px` 고정은 빈 상태도 최대 크기로 보여 제외한다. Rail과 Overlay에 같은 flex-fill을 유지하는 방식은 compact Overlay의 HUG 동작을 막으므로 제외한다.
- Consequences: 빈 Overlay는 내용 높이로 렌더되고, 긴 글·Media·CW가 추가될 때만 최대 높이까지 늘어난다. Rail은 별도의 `420px` 상한을 유지하므로 한 surface의 크기 변경이 다른 surface를 고정 높이로 만들지 않는다.
- Confirmation / Follow-up: compact Overlay가 빈 상태에서 최대 높이보다 작고, 긴 본문에서만 viewport 상한에 도달해 내부 scroll로 전환되는지 검증한다. Rail은 짧은 내용에서 상한보다 작고 `420px`에서 내부 scroll로 전환되는지 별도로 검증한다. Native 실제 runtime과 전체 검증은 해당 미완료 task에서 유지한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### desktop Overlay는 Media 전후 560px로 고정하고 Rail만 Media 상태에 따라 확장

- Decision Date: 2026-09-14
- Decision Class: Human Decision
- Authority / Provenance: `docs/design/figma.md`, `docs/design/breakpoints.md`, PROD-797, 2026-09-14 사용자 화면 피드백
- Status: Superseded
- Superseded By: 2026-09-14 Human Decision `desktop Composer는 내용만큼 늘어나고 surface별 최대 높이에서 내부 scroll` (위 Decision Records의 Active decision)
- Context / Problem: Overlay의 404px 고정은 Media 전후 control 좌표는 보존하지만 승인된 desktop 작성 surface의 기본 높이보다 작았다.
- Decision Outcome: desktop Overlay 외곽을 Media 삽입·제거 전후 560px로 고정하고 Rail은 Media 없음 404px, Media 있음 512px을 사용한다.
- Alternatives Considered: Overlay를 Media 상태에 따라 확장하거나 Media용 min-height를 예약하는 방식은 삽입 전후 geometry 변화를 만든다고 판단했다.
- Consequences: Overlay의 고정 높이가 짧은 내용에도 큰 빈 공간을 만들어 후속 사용자 검토에서 폐기했다.
- Confirmation / Follow-up: 후속 content-flow 결정과 검증 기록으로 대체한다.

### desktop Overlay는 Media 전후 404px로 고정하고 Rail만 Media 상태에 따라 확장

- Decision Date: 2026-09-14
- Decision Class: Human Decision
- Authority / Provenance: `docs/design/figma.md`, `docs/design/breakpoints.md`, PROD-797, 2026-09-14 사용자 화면 피드백
- Status: Superseded
- Superseded By: 2026-09-14 Human Decision `desktop Overlay는 Media 전후 560px로 고정하고 Rail만 Media 상태에 따라 확장` (위 Decision Records의 Active decision)
- Context / Problem: Media가 있을 때 content가 실제보다 404px로 예약되어 삽입·제거 전후 surface geometry와 빈 공간이 어긋난다. CW가 가운데 scroller에 포함되면 긴 본문을 읽을 때 경고 문구도 함께 사라진다.
- Decision Outcome: desktop Overlay `PostComposer`는 Media 삽입·제거 전후 외곽을 404px로 고정한다. author와 editor header·CW·footer는 고정하고 body·Media만 가운데 scroller에서 실제 content 높이로 흐르게 하며 Media용 min-height를 예약하지 않는다. Rail은 기존대로 Media가 없을 때 404px, Media가 있을 때 512px을 사용한다. 짧은 viewport의 Overlay는 Host의 85dvh 안으로 줄어든다. Rail의 editor outline과 개인정보 처리방침 footer는 우측 column 왼쪽에서 16px인 같은 기준선을 사용하고, editor header의 공개 범위와 Expand control은 본문 작성 영역의 좌우 기준선에 맞춘다. 모바일 전체 화면의 높이·scroll 계약은 변경하지 않는다.
- Alternatives Considered: Overlay를 Media 상태에서 더 크게 확장하거나 Media용 min-height를 예약하는 방식은 삽입 전후 불필요한 빈 공간과 geometry 변화를 만든다. Rail까지 고정하면 기존 Media 상태의 제한된 column 높이 계약을 바꾸므로 선택하지 않는다.
- Consequences: Overlay는 Media 삽입·제거 전후 control 위치와 외곽 높이를 유지하고, 실제 body·Media content만 가운데에서 흐른다. Rail은 첨부 전후 404px·512px의 기존 상태별 확장을 유지하며 CW는 본문 scroll과 무관하게 계속 보인다. 모바일 전체 화면의 높이 계약은 변경하지 않는다.
- Confirmation / Follow-up: Web Overlay의 Media 삽입·제거 후 404px 고정, body·Media 실제 content scroll과 min-height 미예약, 짧은 viewport 85dvh 및 고정 author·header·CW·footer를 재검증한다. Native 실제 runtime과 전체 검증은 해당 미완료 task에서 별도로 유지한다.

### desktop 외곽 높이는 Media가 있을 때만 확장

- Decision Date: 2026-09-12
- Decision Class: Human Decision
- Authority / Provenance: `docs/design/figma.md`, `docs/design/breakpoints.md`, PROD-797, 2026-09-12 작성 화면 검토
- Status: Superseded
- Superseded By: 2026-09-14 Human Decision `desktop Overlay는 Media 전후 404px로 고정하고 Rail만 Media 상태에 따라 확장` (위 Superseded Decisions의 404px 기록)
- Context / Problem: Media가 없는 상태도 Rail 512px·Overlay 624px를 유지하면 아직 없는 gallery 공간을 미리 확보한 것처럼 footer 위가 비어 보인다. CW가 가운데 scroller에 포함되면 긴 본문을 읽을 때 경고 문구도 함께 사라진다.
- Decision Outcome: desktop `PostComposer`는 Media가 없을 때 Rail·Overlay 모두 404px이며, Media가 있을 때만 Rail은 512px, Overlay는 624px를 사용한다. Overlay는 짧은 viewport에서 Host의 85dvh 안으로 줄어든다. author와 editor header·CW·footer는 고정하고 body·Media만 가운데 영역에서 scroll한다. Rail의 editor outline과 개인정보 처리방침 footer는 우측 column 왼쪽에서 16px인 같은 기준선을 사용하고, editor header의 공개 범위와 Expand control은 본문 작성 영역의 좌우 기준선에 맞춘다.
- Alternatives Considered: Media가 없어도 큰 높이를 고정하는 방식은 빈 공간을 만든다. 완전한 자연 높이는 상태마다 control 위치 변화를 제한하지 못하므로 Empty source의 404px와 Media 상태별 상한을 유지한다.
- Consequences: 첨부 전에는 불필요한 gallery 여백이 없고, 첨부하면 각 surface의 작성 공간이 확장된다. CW는 본문 scroll과 무관하게 계속 보인다. 모바일 전체 화면의 높이 계약은 변경하지 않는다.
- Confirmation / Follow-up: Empty·CW·Media 전환의 조건부 외곽 높이, CW 고정과 body·Media overflow scroll을 실제 Web Rail·Overlay에서 검증한다.
