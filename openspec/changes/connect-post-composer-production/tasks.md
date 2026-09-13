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

- [ ] 1.1 기존 작성 상태와 callback을 공용 Rail·Overlay·모바일 presentation에 연결한다.
- [ ] 1.2 Content Warning toggle이 입력을 보존하고 기존 합산 길이·제출 차단을 유지하게 한다.
- [ ] 1.3 미구현 Poll·Emoji·이미지 편집 action을 Production에서 숨긴다.
- [ ] 1.4 작성 성공·실패·actor 전환·close/reopen 동작 검증을 추가한다.
- [ ] 1.5 Reply의 기존 presentation, 작성 상태와 mutation 경로 회귀 검증을 통과시킨다.

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

- [ ] 2.1 기존 Media controller 상태와 action을 공용 gallery presentation에 연결한다.
- [ ] 2.2 Ready Media의 Alt Text와 공유 Sensitive Media editor 전환을 연결한다.
- [ ] 2.3 upload·retry·remove·paste·최대 4개·payload 회귀 검증을 추가한다.
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

- [ ] 3.1 Full Web Rail과 Expand Overlay가 같은 draft owner를 사용하게 연결한다.
- [ ] 3.2 compact Web icon rail과 mobile 하단 탭의 compose action을 platform별 Overlay에 연결한다.
- [ ] 3.3 Overlay dismiss, focus, body scroll과 Native back·keyboard·safe area lifecycle을 연결한다.
- [ ] 3.4 direct `/compose` compatibility route를 제거하고, bare `compose` Local Profile 예약을 유지한다.
- [ ] 3.5 shell component 및 Web E2E 회귀 검증을 추가한다.
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

- [ ] 4.1 Production 계약에 맞게 관련 Storybook Tests와 manual Playground를 정렬한다.
- [ ] 4.2 `docs/design/figma.md`와 `docs/design/breakpoints.md`의 Production 이관·검증 상태를 실제 결과에 맞게 갱신한다.
- [ ] 4.3 Relay·typecheck·lint·관련 test·Storybook build·OpenSpec strict validation을 실행한다.
- [ ] 4.4 Web Light/Dark와 full·compact·mobile browser QA 결과 및 미검증 항목을 기록한다.
- [ ] 4.5 change의 모든 task와 Web·Native 검증이 완료되면 최신 canonical·Linear를 다시 대조해 구현·OpenSpec 정합성과 delta spec 동기화를 확인한 뒤 change를 archive하고 archive 후 strict validation을 실행한다. **Owner: PROD-797 / PR #878**
