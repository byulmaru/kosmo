## 1. PROD-797 Composer controller와 공용 presentation 연결

**Authority / Provenance**

- `docs/design/figma.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- DSN-43
- PROD-797

**Deliverable**

기존 일반 Post 작성 상태와 mutation이 공용 Rail·Overlay·모바일 presentation에 표시되고, surface 전환과 close/reopen에서 같은 Profile의 draft가 유지된다.

**Guardrails**

- 기존 작성 controller, Relay actor isolation, `createPost`, 성공 초기화와 실패 시 draft 보존을 재사용한다.
- Poll·Emoji와 이미지 crop·회전·초점 기능은 노출하지 않는다.
- Reply presentation과 lifecycle은 변경하지 않는다.

**Verification**

- body·CW·visibility·글자수·Command/Ctrl+Enter·pending·error·success·actor 전환을 component test로 검증한다.
- Rail → Overlay와 close → reopen에서 draft 및 진행 중 upload가 유지되고 Reply 회귀가 없는지 검증한다.

- [x] 1.1 기존 작성 상태와 callback을 공용 Rail·Overlay·모바일 presentation에 연결한다.
- [x] 1.2 Content Warning toggle이 입력을 보존하고 기존 합산 길이·제출 차단을 유지하게 한다.
- [x] 1.3 미구현 Poll·Emoji·이미지 편집 action을 Production에서 숨긴다.
- [x] 1.4 작성 성공·실패·actor 전환·close/reopen 동작 검증을 추가한다.
- [x] 1.5 Reply의 기존 presentation, 작성 상태와 mutation 경로 회귀 검증을 통과시킨다.

## 2. PROD-797 Media gallery와 editor 연결

**Authority / Provenance**

- `docs/design/figma.md`
- `docs/design/media-upload-errors.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- DSN-43
- PROD-797

**Deliverable**

기존 Media 선택·붙여넣기·upload 상태가 공용 가로 gallery에 표시되고 Ready Media의 Alt Text와 Post 단위 Sensitive Media를 같은 상위 composer editor에서 편집할 수 있다.

**Guardrails**

- 최대 4개, 선택 순서, signed upload, retry, remove, Ready ID와 payload 계약을 유지한다.
- 실패한 항목만 보존·재시도하고 안전한 오류 문구를 사용한다.
- editor는 별도 modal/scrim을 만들지 않으며 preview에 remove action을 추가하지 않는다.

**Verification**

- 1~4개 gallery, overflow scroll, uploading·ready·failed, retry·remove, paste와 제출 차단을 component/integration test로 검증한다.
- Alt Text·Sensitive 편집의 Back·Done·Close와 payload 반영을 Web·Native target test로 검증한다.

- [x] 2.1 기존 Media controller 상태와 action을 공용 gallery presentation에 연결한다.
- [x] 2.2 Ready Media의 Alt Text와 공유 Sensitive Media editor 전환을 연결한다.
- [x] 2.3 upload·retry·remove·paste·최대 4개·payload 회귀 검증을 추가한다.
- [ ] 2.4 gallery와 editor의 pointer·touch·keyboard·accessible name 및 target 동작을 검증한다.

## 3. PROD-797 Shell·Overlay lifecycle와 direct route 제거

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `docs/design/accessibility.md`
- `docs/design/icons.md`
- `docs/domain/objects/profile.md`
- DSN-43
- PROD-797

**Deliverable**

Full Web Rail, compact Web icon rail, mobile Web·Android·iOS 하단 탭이 동일한 Production composer 계약을 열고 platform별 dismiss·focus·keyboard·복귀 동작을 제공하며, direct `/compose` compatibility route는 제공하지 않는다.

**Guardrails**

- navigation chrome의 geometry와 다른 destination 동작을 변경하지 않는다.
- 이름이 있는 modal semantic surface, Escape·backdrop·Native back, focus trap/restore와 body scroll 경계를 유지한다.
- 제출 pending 중에는 기존 공용 composer dismiss boundary로 Web Escape·backdrop·닫기 action과 Native platform back을 모두 차단하고 surface·draft·pending 상태를 유지한다.
- direct `/compose` 접근은 composer host를 열지 않고 404가 될 수 있으며, bare `compose`는 Local Profile System Reserved Handle로 유지한다. shell이 연 모바일 surface의 제출 성공은 Home으로 돌아간다.

**Verification**

- shell component/E2E에서 Full·compact·mobile 진입, Rail Expand, no-profile 경계와 shell surface 성공 복귀를 검증한다.
- route tree와 직접 URL 접근을 확인해 `/compose`가 composer host를 렌더링하지 않고, 기존 Profile creation 계약에서 bare `compose` 예약이 유지되는지 확인한다.
- Web keyboard/focus/backdrop/Escape/body scroll/short viewport와 Android·iOS keyboard/back/safe area/touch/focus를 각각 runtime에서 검증한다.
- 제출 pending 중 Web Escape·backdrop·닫기 action과 Native platform back이 같은 dismiss boundary에서 차단되는지 각각 검증한다.

- [x] 3.1 Full Web Rail과 Expand Overlay가 같은 draft owner를 사용하게 연결한다.
- [x] 3.2 compact Web icon rail과 mobile 하단 탭의 compose action을 platform별 Overlay에 연결한다.
- [x] 3.3 Overlay dismiss, focus, body scroll과 Native back·keyboard·safe area lifecycle을 연결한다.
- [x] 3.4 direct `/compose` compatibility route를 제거하고, bare `compose` Local Profile 예약을 유지한다.
- [x] 3.5 shell component 및 Web E2E 회귀 검증을 추가한다.
- [ ] 3.6 iOS·Android 실제 runtime에서 진입·닫기·keyboard·back·safe area·touch/focus를 확인하고 결과를 기록한다.
- [x] 3.7 내부 close의 draft 보존은 유지하고 dirty Production Composer에만 Web 문서 unload 확인을 연결하며 clean 전환에서 해제되는지 browser interaction으로 검증한다.

## 4. PROD-797 통합 검증과 문서 동기화

**Authority / Provenance**

- `docs/design/figma.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `docs/design/media-upload-errors.md`
- DSN-43
- PROD-797

**Deliverable**

Production 연결 결과와 실제 검증 범위가 Storybook, 디자인 문서와 완료 기록에 일치한다.

**Guardrails**

- Playground는 수동 Controls·Actions용으로 유지하고 자동 interaction은 Controls가 비활성화된 Tests story에 둔다.
- Web 검증을 Native runtime 완료 증거로 사용하지 않는다.
- 현재 변경과 무관한 API/model, Profile switching, Poll·Emoji와 Reply redesign을 포함하지 않는다.

**Verification**

- Relay compiler, 앱 check/typecheck, 관련 unit/integration/Storybook interaction, static Storybook build와 OpenSpec strict validation을 통과시킨다.
- Web Light/Dark full·compact·mobile 시각/interaction QA와 Native 실제 검증을 구분해 기록한다.
- focused Storybook/browser에서 Web Composer Rail·Overlay의 thin scrollbar, `borderStrong` thumb, 투명 track, Overlay 전용 stable gutter, Rail no-gutter와 horizontal gallery 예외를 확인한다.

- [x] 4.1 Production 계약에 맞게 관련 Storybook Tests와 manual Playground를 정렬한다.
- [x] 4.2 `docs/design/figma.md`와 `docs/design/breakpoints.md`의 Production 이관·검증 상태를 실제 결과에 맞게 갱신한다.
- [ ] 4.3 Relay·typecheck·lint·관련 test·Storybook build·OpenSpec strict validation을 실행한다.
- [x] 4.4 Web Light/Dark와 full·compact·mobile browser QA 결과 및 미검증 항목을 기록한다.
- [ ] 4.5 change의 모든 task와 Web·Native 검증이 완료되면 최신 canonical·Linear를 다시 대조해 구현·OpenSpec 정합성과 delta spec 동기화를 확인한 뒤 change를 archive하고 archive 후 strict validation을 실행한다. **Owner: PROD-797 / PR #878**

### 재검증 상태 — 2026-09-12

- 임시 DB와 새 Web export에서 `compose`, `profile-switcher`, `navigation-scroll`, `auth-routes` E2E 64개가
  통과했다. 이미지 업로드 E2E는 network mock으로 issue/complete ID와 최종 ALT·Sensitive payload를 검증하며,
  실제 storage 서비스 업로드를 실행했다는 뜻은 아니다.
- 앱 unit 570개, 전체 Storybook 119 files/795개(작성기·미디어 editor·Shell interaction 37개 포함), 변경 파일
  ESLint와 Storybook build, OpenSpec strict validation이 통과했다. 전체 Storybook 중 한 차례 발생한 기존 Toast
  timer 실패는 단독 실행과 최종 전체 재실행에서 통과했다.
- 2.4의 Web gallery/editor interaction, ALT·Sensitive payload, editor 복귀 focus와 화면 폭 전환 뒤 paste는
  확인했다. Native의 실제 target·touch·screen-reader focus는 3.6과 함께 남아 있어 전체 완료로 표시하지 않는다.
- 4.3에서 Relay compiler는 통과했으나 앱 typecheck는 기존 `SettingsLinkRow.test.ts:92`의 mock `href: string`과
  Expo typed route 간 타입 불일치로 실패한다. 이 변경에서는 해당 Settings 테스트를 수정하지 않았다.
- Web browser에서 Full Light/Dark, compact Dark short viewport, 모바일 Light/Dark의 작성창 배치를 확인했다.
  Android/iOS menu Modal 종료 후 focus 복귀와 ALT 입력 시 IME reveal은 실제 runtime 미검증이다.

### 입력 focus 표시 후속 검증 — 2026-09-12, 2026-09-16 정정

- 본문·CW·ALT 입력 자체의 outline과 focus에 따른 border 두께 변화는 제거했다. 2026-09-16 사용자 화면 검토로
  Rail 본문 focus는 TextInput 대신 editor outline 전체를 primary 색으로 표시하고, Overlay·모바일 본문과 CW·ALT에는
  이 외곽 강조를 적용하지 않도록 정정했다. 공용 TextField·Reply, 버튼·탭과 Overlay focus lifecycle은 유지했다.
- 기존 Composer·Media editor·Shell Tests story와 `RailFocusBoundaryContract`가 실제 입력의 focused/blurred
  border·outline, Rail editor 외곽 primary 표시와 값 보존을 검증한다. Playground 자동 interaction은 추가하지 않았다.
- 실제 Metro dev에서 Rail·Overlay·모바일 본문과 CW의 caret·입력·Tab 이동 및 도구 버튼의 keyboard focus
  표시를 확인했다. ALT는 공용 컴포넌트 Storybook의 Web Light·모바일 Dark에서 확인했으며 실제 storage upload나
  Native IME 검증으로 간주하지 않는다.
- Storybook build·문서 Prettier·OpenSpec strict validation이 통과했다. 앱 check는 위의 기존 Settings 테스트
  타입 오류로 실패하며 Native 관련 미완료 task는 유지한다.
- 추가 정정: 내장 dev Browser에서 모바일 본문의 `outline: auto 0px`가 파란 링으로 남는 것을 재현했다.
  기본 `auto`를 해제한 뒤 같은 본문의 초기 focus와 Tab 재진입 화면에서 링 없이 caret만 남는 것을 확인했다.
  기존 모바일 입력 Tests에 outline 방식 검증을 추가했고 Composer·Media editor·Shell 37개가 다시 통과했다.

### Desktop Composer 높이 재검증 — 2026-09-12

- 사용자 화면 검토에 따라 desktop Overlay는 가용 높이에서 Empty source의 404px 외곽을 유지하고,
  author와 editor header·footer 사이의 body·CW·Media만 scroll하도록 정리했다. 후속 실제 화면 검토에서 Rail도
  같은 상태 변화로 늘어나는 것을 확인해 Desktop Rail까지 동일한 404px·가운데 scroll 계약을 적용했다. 모바일 구조는 변경하지 않았다.
- 실제 Metro dev 1280×720에서 Empty·CW·실패 Media 상태 모두 dialog 468px, composer 404px와 고정 control
  좌표가 유지됐다. CW는 가운데 영역의 58px overflow를 keyboard PageDown으로 scroll했고, Media는 실제 파일을
  첨부해 404px overflow와 고정 footer를 확인했다.
- 1280×380에서는 composer가 Host의 85dvh 안에서 259px로 줄고 37px 가운데 영역만 scroll하며 header·footer가
  모두 viewport 안에 남는 것을 확인했다. Android/iOS 실제 runtime 미검증과 기존 앱 typecheck 실패는 유지한다.
- 실제 Metro dev 1440×900 Rail의 CW·실패 Media 동시 상태에서 외곽 404px, 가운데 183px와 277px overflow를
  확인했다. PageDown 뒤 가운데 scrollTop만 159px로 이동했고 footer의 Y 좌표는 355.44px로 유지됐다.

### Overlay 높이·모바일 menu inset 재검토 — 2026-09-12 (이전 기록)

- 당시 후속 사용자 화면 검토에서 desktop Overlay는 작은 Empty 높이 대신 Media specimen의 624px를
  사용하고, Rail은 제한된 컬럼에 맞는 404px를 유지하도록 계약을 분리했다. Overlay 높이 결정은
  2026-09-14 사용자 화면 피드백으로 대체됐다.
- 모바일 공개 범위 menu는 Web과 Native 모두 화면 오른쪽에서 16px inset을 두도록 정렬했다.
- PostComposer Storybook interaction 28개와 OpenSpec strict validation이 통과했다. 실제 Metro dev mobile Web에서
  240px menu의 viewport·composer shell 오른쪽 inset이 모두 16px임을 확인했다.
- Figma `04 Screens - Mobile` section에 390×844 `Visibility open Light` consumer를 추가하고 240px menu의
  `x=134`, 오른쪽 inset 16px, semantic elevated·border variable binding을 screenshot·readback으로 확인했다.

### Rail 높이·왼쪽 기준선 재검토 — 2026-09-12

- 후속 사용자 화면 검토와 Mastodon의 content-flowing 작성 구조를 참고해 Rail을 512px로 조정하고, footer
  위치는 고정한 채 CW·Media overflow만 가운데 영역에서 scroll하게 유지했다.
- Figma `RightRail` source에서 Composer editor outline과 개인정보 처리방침이 Rail 왼쪽 +16px에 정렬된 것을
  readback하고, Production의 중첩 부모 inset을 제거해 같은 기준선에 맞췄다.
- Expand의 40px target 안에서 32px였던 visual box를 40px로 맞춰 공개 범위·본문 작성 영역과 좌우 기준선을
  일치시켰다.
- Figma Rail variant의 512px source 동기화는 Figma 수정 승인 전 검증 공백으로 남겼다.

### 첨부 전 빈 공간·CW scroll 재검토 — 2026-09-12 (이전 기록)

- 당시 후속 사용자 화면 검토에 따라 Media가 없을 때는 Rail·Overlay 모두 404px를 사용하고, Media가 있을 때만
  Rail 512px·Overlay 624px로 확장해 아직 없는 gallery 공간을 미리 확보하지 않게 했다. Overlay 높이 결정은
  2026-09-14 사용자 화면 피드백으로 대체됐다.
- CW는 editor header 아래의 고정 영역으로 옮기고 body·Media만 가운데 영역에서 scroll하게 정리했다.

### Direct `/compose` 제거 재검증 — 2026-09-13

- direct route와 전용 Storybook screen을 삭제하고 shell의 compact·mobile compose action만 같은 Host를 열도록
  정리했다. bare `compose`는 trim·case fold 기준의 Local Profile System Reserved Handle로 유지했다.
- 후속 PR 리뷰에 따라 기존 `web-app-shell`의 Native `/compose` 화면과 mobile·compact `/compose` link 계약을
  `MODIFIED` delta로 shell action 계약으로 교체하고, `profile` capability의 `compose` 분류도 현재 정적 route가 아닌
  retired 영구 예약 segment로 교체했다. archive 후 기존 MUST 계약이 함께 남지 않도록 capability 경계를 명시했다.
- 새 Web export를 포함한 격리 DB에서 `auth-routes`, `compose`, `profile-switcher` E2E 47개가 통과했다. direct
  `/compose`는 동적 Profile route의 missing 상태로 해석되며 Composer를 렌더링하지 않았다.
- 앱 unit 569개, Profile validation unit 5개, Relay compiler와 앱 typecheck, 변경 파일 ESLint, Storybook 정적
  build, 관련 OpenSpec change 5개의 strict validation과 `git diff --check`가 통과했다.
- Storybook browser interaction은 공유 `node_modules`의 `@storybook/addon-vitest` dynamic import 실패로 실행되지
  않았다. Android·iOS 실제 runtime 검증도 남아 있으므로 3.6과 전체 검증 4.3은 완료 처리하지 않는다.

### Desktop Overlay 고정 높이·Media content-flow 후속 재검증 — 2026-09-14

- 사용자 화면 피드백에 따라 desktop Overlay `PostComposer`는 Media 삽입·제거 전후 외곽 560px 고정으로
  canonical 문서와 runtime 기준을 정렬했다. Overlay의 author·editor header·CW·footer는 고정하고 body·Media만
  중앙 scroller에서 실제 content 높이로 흐르며 Media용 min-height를 예약하지 않는다.
- Rail은 기존대로 Media 없음 404px, Media 있음 512px을 유지하고, 짧은 viewport의 Overlay는 Host 85dvh 제한을
  따른다. 모바일 전체 화면의 기존 높이·scroll·공개 범위 menu inset 계약은 변경하지 않았다.
- 기존 `OverlayGeometryContract`에 Media 1개+CW, Media 제거 후 text-only, 본문 clear+CW off 후 empty 상태의
  no-scroll, body·gallery의 실제 content geometry, CW toggle·Media 제거 전후 외곽과 고정 control 좌표를 추가했다.
  `ShortViewportContract`에는 iframe 85dvh와 64px header 합성 높이, CW 이후 visibility·CW·footer 좌표 고정 및 기존
  실제 overflow 경계를 추가했다. focused Storybook browser test 28개, 변경 파일 ESLint·Prettier와 OpenSpec strict
  validation이 통과했다.
- 이번 기록은 Figma source를 수정하지 않고 runtime·canonical 문서 정렬만 반영한다. Android·iOS 실제 runtime과
  전체 suite, Metro/native short viewport runtime은 이 실행에서 확인하지 않았고 각각 3.6, 4.3·4.5의 미완료 상태로
  유지한다.

### Desktop Composer content-flow 재검토 — 2026-09-14

- 후속 사용자 화면 검토와 Mastodon의 좁은 compose panel 흐름을 참고해 앞선 Overlay `560px`, Rail
  `404px`·`512px` 고정 높이 결정을 대체했다. Rail은 우측 column에서 본문·Media gallery·footer를 HUG한다.
- Media가 있을 때 본문 최소 높이를 `100px`로 줄이고 gallery를 바로 다음에 배치했으며, 가운데 content의
  `minHeight: 100%`와 Media용 외곽 높이 예약을 제거했다.
- Overlay는 `640px` 폭, viewport 상단 `48px`에 배치하고 content를 HUG하다가 상·하 `48px` gutter를 제외한
  최대 높이에 도달하면 body·Media만 가운데에서 scroll한다. 모바일 전체 화면 계약은 변경하지 않았다.
- PostComposer Storybook browser test 28개, 변경 대상 Full Web Shell contract 1개와 Host·Shell unit 15개가
  통과했다. 실제 Metro dev에서 빈 Rail·Overlay를, Storybook에서 Rail 3장과 Overlay 3장+CW를 확인해 gallery가
  본문 바로 다음에 보이고 footer 앞의 예약 여백과 초기 세로 scroll이 사라진 것을 확인했다.

### Full Web Rail 좌우 폭 정렬 — 2026-09-14

- 사용자 화면 검토에 따라 Full Web Rail을 풀 사이드바와 같은 `320px`로 넓혔다. Rail의 content-flow와
  Overlay 폭·배치 계약은 변경하지 않았다.
- Full Web Shell Storybook contract 1개와 변경 파일 ESLint·Prettier, OpenSpec strict validation이 통과했고,
  `1280px` 로컬 화면에서 좌·우 column이 같은 폭으로 렌더되는 것을 확인했다.

### Desktop Composer 본문 자동 높이 — 2026-09-14

- Desktop 본문 `TextArea`를 content height에 맞게 늘리고 자체 scroll을 끄면서, 텍스트·Media·CW가 Overlay
  최대 높이에 닿기 전까지 같은 content-flow에서 외곽을 늘리게 했다. 상한 이후에는 기존
  body·Media scroller가 overflow를 소유한다.
- 로컬 브라우저에서 짧은 글 `470px`, 10줄 `542px`, 40줄 viewport 상한 `624px`를 확인했고,
  Full Web Shell contract 1개와 PostComposer contract 28개가 통과했다.
- 후속 화면 검토에서 Rail도 자동 높이를 유지하되 스크린샷 수준의 `420px`를 외곽 상한으로 확정했다.
  텍스트·Media·CW가 이 상한을 넘으면 Rail의 body·Media 영역만 scroll한다. 이 결정은 2026-09-16 Derived Contract
  `Rail 외곽 상한을 폐기하고 본문·Media 영역을 분리`로 Superseded 되었다.
- 로컬 브라우저에서 Rail은 짧은 글 `406px`에서 20줄 `420px`까지만 늘어났고, body·Media 영역은
  `198px` viewport에 `496px` content를 보유해 내부 scroll로 전환된 것을 확인했다. PostComposer contract 28개와
  Full Web Shell contract 1개가 통과했다.
- compact Overlay geometry contract 1개에서 빈 dialog가 viewport 상한보다 작고, 본문 추가 시에만 늘어나며,
  긴 본문에서는 상·하 `48px` gutter 상한에 도달한 뒤 내부 scroll로 전환되는 것을 확인했다. 본문을 모두 지우면
  다시 빈 dialog 높이로 줄어드는 회귀도 함께 검증했다.

### Rail 외곽 상한 폐기·본문 scroll 영역 정렬 — 2026-09-16

- 사용자 승인에 따라 Rail의 외곽 `420px` 상한과 정확 높이 계약을 폐기하고 전체 content HUG를 canonical로 정렬했다.
- Rail 본문 TextInput은 `300px`에서 입력 내부 scroll을 소유하고, `112px` Media gallery는 본문 scroller 밖 별도
  영역에 두며 footer는 항상 가시 상태를 유지한다. Overlay의 viewport 상·하 `48px` gutter 상한은 유지한다.
- `Shell.tests`의 구식 Rail exact height assertion을 제거했으며, 기존 `RailBodyMaxHeightContract`의 본문 `300px`
  실동작·본문 scroller 비스크롤 검증은 유지한다. OpenSpec 완료 체크박스는 새로 완료 처리하지 않았다.
