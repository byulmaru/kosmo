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

## 3. PROD-797 Shell·Overlay·`/compose` lifecycle

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `docs/design/accessibility.md`
- `docs/design/icons.md`
- DSN-43
- PROD-797

**Deliverable**

Full Web Rail, compact Web icon rail, mobile Web·Android·iOS 하단 탭과 `/compose`가 동일한 Production composer 계약을 열고 platform별 dismiss·focus·keyboard·복귀 동작을 제공한다.

**Guardrails**

- navigation chrome의 geometry와 다른 destination 동작을 변경하지 않는다.
- 이름이 있는 modal semantic surface, Escape·backdrop·Native back, focus trap/restore와 body scroll 경계를 유지한다.
- `/compose` close는 history가 있으면 back, 없으면 Home이며 모바일 제출 성공은 Home으로 돌아간다.

**Verification**

- shell component/E2E에서 Full·compact·mobile 진입, Rail Expand, `/compose` 위임, no-profile 경계와 성공 복귀를 검증한다.
- Web keyboard/focus/backdrop/Escape/body scroll/short viewport와 Android·iOS keyboard/back/safe area/touch/focus를 각각 runtime에서 검증한다.

- [x] 3.1 Full Web Rail과 Expand Overlay가 같은 draft owner를 사용하게 연결한다.
- [x] 3.2 compact Web icon rail과 mobile 하단 탭의 compose action을 platform별 Overlay에 연결한다.
- [x] 3.3 Overlay dismiss, focus, body scroll과 Native back·keyboard·safe area lifecycle을 연결한다.
- [x] 3.4 `/compose`를 같은 composer 계약의 호환 경계로 정리하고 close fallback을 구현한다.
- [x] 3.5 shell·route component 및 Web E2E 회귀 검증을 추가한다.
- [ ] 3.6 iOS·Android 실제 runtime에서 진입·닫기·keyboard·back·safe area·touch/focus를 확인하고 결과를 기록한다.

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

- [x] 4.1 Production 계약에 맞게 관련 Storybook Tests와 manual Playground를 정렬한다.
- [x] 4.2 `docs/design/figma.md`와 `docs/design/breakpoints.md`의 Production 이관·검증 상태를 실제 결과에 맞게 갱신한다.
- [ ] 4.3 Relay·typecheck·lint·관련 test·Storybook build·OpenSpec strict validation을 실행한다.
- [x] 4.4 Web Light/Dark와 full·compact·mobile browser QA 결과 및 미검증 항목을 기록한다.

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

### 입력 focus 표시 후속 검증 — 2026-09-12

- 사용자 화면 검토에 따라 본문·CW·ALT의 outline과 focus에 따른 border 두께 변화만 제거했다. 외곽 강조는
  추가하지 않았고 공용 TextField·Reply, 버튼·탭과 Overlay focus lifecycle은 유지했다.
- 기존 Composer·Media editor·Shell Tests story 37개가 통과했다. 실제 입력 후 focused/blurred border·outline과
  값 보존을 검증하며 새 테스트 fixture나 Playground 자동 interaction은 추가하지 않았다.
- 실제 Metro dev에서 Rail·Overlay·모바일 본문과 CW의 caret·입력·Tab 이동 및 도구 버튼의 keyboard focus
  표시를 확인했다. ALT는 공용 컴포넌트 Storybook의 Web Light·모바일 Dark에서 확인했으며 실제 storage upload나
  Native IME 검증으로 간주하지 않는다.
- Storybook build·문서 Prettier·OpenSpec strict validation이 통과했다. 앱 check는 위의 기존 Settings 테스트
  타입 오류로 실패하며 Native 관련 미완료 task는 유지한다.
- 추가 정정: 내장 dev Browser에서 모바일 본문의 `outline: auto 0px`가 파란 링으로 남는 것을 재현했다.
  기본 `auto`를 해제한 뒤 같은 본문의 초기 focus와 Tab 재진입 화면에서 링 없이 caret만 남는 것을 확인했다.
  기존 모바일 입력 Tests에 outline 방식 검증을 추가했고 Composer·Media editor·Shell 37개가 다시 통과했다.

### Desktop Overlay 높이 재검증 — 2026-09-12

- 사용자 화면 검토에 따라 desktop Overlay는 가용 높이에서 Empty source의 404px 외곽을 유지하고,
  author와 editor header·footer 사이의 body·CW·Media만 scroll하도록 정리했다. Rail·모바일 구조는 변경하지 않았다.
- 실제 Metro dev 1280×720에서 Empty·CW·실패 Media 상태 모두 dialog 468px, composer 404px와 고정 control
  좌표가 유지됐다. CW는 가운데 영역의 58px overflow를 keyboard PageDown으로 scroll했고, Media는 실제 파일을
  첨부해 404px overflow와 고정 footer를 확인했다.
- 1280×380에서는 composer가 Host의 85dvh 안에서 259px로 줄고 37px 가운데 영역만 scroll하며 header·footer가
  모두 viewport 안에 남는 것을 확인했다. Android/iOS 실제 runtime 미검증과 기존 앱 typecheck 실패는 유지한다.
