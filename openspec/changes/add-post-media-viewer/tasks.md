## 1. PROD-650 Gallery 진입과 Viewer session 경계

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/post-media-gallery.md`
- `docs/design/post-media-viewer.md`
- PROD-650

**Deliverable**

일반 목록·상세의 공개된 정상 이미지 tile에서 선택한 위치의 Viewer를 열고, 현재 Post·Profile·Content revision이 유지되는 동안만 같은 Media 목록을 사용한다.

**Guardrails**

- Post surface가 Viewer session과 origin focus target을 소유하고 Gallery는 document index만 전달한다.
- Sensitive 가림 상태와 `interactive=false` Reply 부모 preview에는 Viewer 진입을 제공하지 않고, 열린 뒤 Sensitive 재가림·삭제·현재 조회 결과 무효화 시 이전 Media를 유지하지 않는다.
- 별도 Media query·authorization을 추가하거나 다른 Post·Profile·revision의 Media를 섞지 않는다.
- PROD-626의 gallery geometry·Sensitive·retry 동작을 복제하거나 회귀시키지 않는다.

**Verification**

- Component test로 정상 tile의 선택 index, 주변 Post navigation 전파 차단, Sensitive·retry control 격리, Reply preview 비대화형 경계와 identity 변경·Sensitive 재가림·삭제·조회 무효화 close를 검증한다.
- PROD-626 baseline의 1·2·3·4장, Sensitive와 error·retry test를 함께 통과시킨다.

- [x] 1.1 Post surface에서 현재 Post·Content identity와 선택 index를 소유하고 Gallery의 정상 tile 선택을 받을 수 있게 한다.
- [x] 1.2 공개된 정상 tile에 viewer trigger semantics와 접근 가능한 이름을 제공하고 주변 navigation과 기존 gallery control 실행을 격리한다.
- [x] 1.3 Sensitive 가림·다시 가리기, 열린 session의 Sensitive 재가림·삭제·조회 무효화, Reply 부모 preview와 Post·Profile·revision lifecycle 경계의 자동화 회귀 검증을 추가한다.

## 2. PROD-650 Image surface와 Media 탐색

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- PROD-650

**Deliverable**

선택한 Media를 원본 비율로 크게 표시하고 같은 Content revision의 최대 4장을 이전·다음, Web keyboard와 Native swipe로 비순환 탐색할 수 있다.

**Guardrails**

- Viewer 이미지는 `contain`을 사용하고 gallery의 `cover` geometry를 변경하지 않는다.
- 첫·마지막 경계에서 반대편으로 순환하지 않고 범위를 벗어나는 control을 disabled로 전달한다.
- 다중 Media에만 시각 counter를 표시하며 Screen Reader 위치 정보는 단일 Media에도 제공하고, nullable Alt Text 또는 document 순서 fallback을 image accessible name으로 별도 유지한다.
- Loading·error·retry는 Media identity별로 격리하고 raw URL·내부 오류·권한 세부 정보를 노출하지 않는다.

**Verification**

- Component test로 선택 index, 1장·첫·중간·마지막, button·keyboard·swipe 이동, 비순환 경계, Alt Text·fallback과 counter·announcement를 검증한다.
- 각 Media의 loading·error·retry가 현재 index와 다른 Media 상태를 변경하지 않는지 검증한다.

- [x] 2.1 Modal image surface에 선택 Media의 `contain` 표시와 identity별 loading·error·retry 상태를 제공한다.
- [x] 2.2 이전·다음 control, 비순환 index 전이, nullable Alt Text·fallback과 단일·다중 counter·Screen Reader 위치 정보를 구현한다.
- [x] 2.3 Web arrow key와 vertical scroll을 침범하지 않는 Native 수평 swipe를 같은 탐색 결과에 연결한다.
- [x] 2.4 탐색·상태·오류 격리의 focused component test를 추가하고 통과시킨다.

## 3. PROD-650 반응형 Post detail과 기존 Action Bar

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/design/post-media-viewer.md`
- `docs/design/post-action-bar.md`
- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- PROD-650

**Deliverable**

Viewer가 Mobile 세로·Web 분할 layout에서 작성자, 3줄 원문과 고정된 기존 Post Action Bar를 같은 Post 맥락으로 제공한다.

**Guardrails**

- Web `<768px`와 Native는 세로, Web `>=768px`는 image 왼쪽·detail 오른쪽 layout을 사용한다.
- 실제로 3줄을 넘는 원문에만 더 보기·접기를 제공하고 펼친 text 영역만 scroll한다.
- 기존 Post Action Bar의 Reply·Repost·Reaction·Bookmark·More target·authentication·selected Profile·count·pending·cache·failure 계약과 일반·Repost·Quote Post surface의 target routing을 재사용하고 Quote를 새 action으로 추가하지 않는다.
- Media 파일 공유·다운로드·기기 저장, Viewer 전용 action과 새 Post 링크 계약을 추가하지 않는다.

**Verification**

- Component·Storybook test로 짧은·긴 원문, expanded state, text-only scroll 경계, fixed Action Bar와 767·768px layout을 검증한다.
- Web·iOS·Android runtime에서 Action Bar child overlay의 layering, dismiss 순서와 focus를 action별로 확인한다.

- [x] 3.1 작성자와 실제 overflow 기반 3줄 원문·더 보기·접기·text scroller를 detail panel에 제공한다.
- [x] 3.2 Web 768px 경계와 Native 고정 Mobile layout에서 image·detail·고정 Action Bar 영역을 조합한다.
- [x] 3.3 기존 Post Action Bar fragment·binding을 같은 Post target으로 연결하고 Viewer 전용 Media action이 없음을 회귀 검증한다.
- [ ] 3.4 Reaction·Repost·More·Reply overlay를 세 플랫폼에서 확인하고 기존 동작을 보존하는 layer 처리만 적용한다.

## 4. PROD-650 Modal 접근성과 플랫폼 runtime 검증

**Authority / Provenance**

- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- PROD-650

**Deliverable**

Viewer를 keyboard·touch·VoiceOver·TalkBack으로 열고 탐색하고 닫을 수 있으며, 닫은 뒤 원래 tile 또는 안전한 Post target으로 돌아간다.

**Guardrails**

- 명시적인 close control과 modal semantics를 제공한다. Web backdrop 직접 press는 닫되 image·detail panel·modal 내부 control press는 backdrop dismiss로 전파하지 않고, backdrop을 유일한 dismiss 수단으로 사용하지 않는다.
- Web `Escape`, close control과 Native back이 같은 close lifecycle을 사용한다.
- 자동화·Storybook·Web 관찰을 iOS·Android runtime 접근성 증거로 대체하지 않는다.

**Verification**

- Component·Storybook에서 modal role, close 초기 focus, backdrop·내부 press 격리, focus boundary·복귀, disabled·expanded·busy state와 accessible name을 확인한다.
- Web backdrop·내부 pointer·keyboard·Screen Reader, iOS touch·swipe·back·VoiceOver, Android touch·swipe·back·TalkBack 결과를 별도 증거로 기록한다.

- [x] 4.1 Modal semantics, close 초기 focus, Web backdrop·내부 press 격리, focus boundary·Escape와 origin tile·fallback Post target 복귀를 구현하고 자동화한다.
- [x] 4.2 1장·다중·긴 원문·첫/중간/마지막·loading/error와 compact/wide Viewer Storybook 사례를 추가한다.
- [ ] 4.3 Web `<768px`·`>=768px`에서 backdrop·내부 pointer, keyboard·focus·Screen Reader runtime을 확인하고 결과를 기록한다.
- [ ] 4.4 iOS에서 touch·button·swipe·back·VoiceOver runtime을 확인하고 결과를 기록한다.
- [ ] 4.5 Android에서 touch·button·swipe·back·TalkBack runtime을 확인하고 결과를 기록한다.

## 5. PROD-650 통합 검증·전달·archive

**Authority / Provenance**

- `docs/design/post-media-gallery.md`
- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- PROD-626
- PROD-650

**Deliverable**

PROD-626 위의 Viewer 고유 diff가 자동화와 플랫폼별 runtime 증거를 갖춘 review 가능한 PR로 전달되고, 선행 gallery 계약과 archive 순서를 지킨다.

**Guardrails**

- PROD-626의 최신 검증된 head 위에 stack하고 부모 고유 구현이나 남은 Native QA·archive 책임을 PROD-650에 포함하지 않는다.
- PR 자체 범위와 필수 검증이 끝나면 Ready 판단을 OpenSpec archive와 분리한다.
- PROD-650 OpenSpec은 PROD-626의 gallery requirement가 canonical spec에 반영되고 PROD-650 전체 task·검증이 끝난 뒤에만 archive한다.

**Verification**

- Focused unit·Storybook 뒤 `pnpm --filter @kosmo/app test`, 관련 lint·Prettier, `git diff --check`, scoped와 전체 OpenSpec strict validation을 통과시킨다.
- Exact parent SHA, stack-only diff, CI와 미실행 runtime 항목을 PR에 분리해 기록한다.

- [ ] 5.1 Focused test와 전체 App test, lint·Prettier, diff check와 `add-post-media-viewer` strict validation을 통과시킨다.
- [ ] 5.2 PROD-626 exact parent SHA와 stack-only diff를 확인하고 구현·자동화·Web·iOS·Android 증거 및 제외 범위를 PR에 기록한다.
- [ ] 5.3 PROD-650 자체 구현과 필수 검증이 완료되면 PR readiness를 판단하되 OpenSpec을 조기 archive하지 않는다.
- [ ] 5.4 PROD-626 archive 뒤 canonical `post-media-display`와 이 delta를 동기화하고 모든 PROD-650 task·runtime·CI가 완료된 경우 PROD-650 소유로 change를 archive한 뒤 strict validation을 통과시킨다.
