## 1. PROD-626 개수별 Post Media gallery

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/breakpoints.md`
- PROD-626

**Deliverable**

Post 목록과 상세가 같은 공용 renderer를 사용해 한 장의 기존 비율을 보존하고, 두 장은 token gap을 제외한 이미지 영역 2:1의 정사각 2열, 세 장은 16:9의 왼쪽 첫 이미지+오른쪽 2분할, 네 장은 1:1의 2×2 gallery로 document 순서대로 표시한다.

**Guardrails**

- 다중 tile은 공용 theme token의 간격·radius 안에서 외곽 border 없이 `cover`로 표시하며 원본을 늘이거나 찌그러뜨리지 않는다.
- gallery는 Post body 폭과 작은 Web viewport·iOS·Android 화면을 초과하지 않는다.
- Home·Profile·Post 상세별 별도 layout, 새 breakpoint, API·Relay·서버·DB 계약과 새 dependency를 추가하지 않는다.
- 구현 출발점과 허용 대안은 `design.md`의 비규범적 guidance를 따를 수 있으나 공개 범용 abstraction을 만들지 않는다.

**Verification**

- 한 장의 가로·정사각 원본 비율과 세로 1:1 crop 유지, 두 장의 정사각 tile·token 공간·계산된 높이, 세 장·네 장의 surface 비율·row/column 구조·Media 순서를 component test로 확인한다.
- 1·2·3·4장 Storybook 사례에서 Post 폭과 compact viewport 안의 visual geometry를 확인한다.

**테스트 코드 범위**

- 기존 Post Media gallery component test의 1·2·3·4장 구조·순서·surface 비율과 빠진 3장 Storybook fixture.

**테스트 필요성**

- 승인된 개수별 배치가 기존 세로 나열을 실제로 교체하고 목록·상세 공용 renderer에서 같은 결과를 내는지 직접 증명한다.

**테스트 제외 범위**

- 새 screenshot harness, 광범위 snapshot, route별 중복 fixture, viewer·Composer·API·DB 테스트와 테스트 인프라 변경.

- [x] 1.1 개수별 gallery layout·crop·접근성 결정을 적용되는 `docs/design` canonical 문서에 기록한다.
- [x] 1.2 한 장의 기존 비율, 두 장의 token 공간을 제외한 정사각 tile geometry와 3·4장 구조·순서·surface 비율을 직접 검증하는 최소 회귀 테스트와 3장 Storybook 사례를 추가하고 기존 구현에서 실패함을 확인한다.
- [x] 1.3 승인된 개수별 surface와 tile 배치를 공용 Post Media presentation에 구현하되 한 장의 측정 비율 경로와 목록·상세 소비자 계약을 유지한다.
- [x] 1.4 targeted Post Media unit test와 Storybook 검증을 통과시키고 1·2·3·4장 visual geometry를 확인한다.

## 2. PROD-626 Sensitive·오류·상호작용 안정성

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/accessibility.md`
- PROD-626

**Deliverable**

Sensitive 공개 전후와 이미지별 loading·ready·error·retry 상태가 개수별 gallery 경계와 순서를 유지하고, 이미지 tile은 후속 viewer 전까지 비상호작용으로 남는다.

**Guardrails**

- Sensitive 가림 상태에서 이미지 byte를 미리 load하지 않는다.
- 한 장 가림 surface는 1:1이고 공개 뒤 기존 단일 이미지 비율을 사용한다. 두 장은 정사각 tile에서 계산한 높이, 세 장은 16:9, 네 장은 1:1 surface를 공개 전후에 유지한다. 다중 가림 상태는 실제 gallery tile·내부 gap을 렌더하지 않는 단일 placeholder를 사용한다.
- 실패·loading 표현은 해당 tile만 대체하고 gallery surface·인접 tile·Post 본문·action·navigation을 밀거나 실패시키지 않는다.
- 정상 tile에 button·link role이나 press action을 추가하지 않는다. 일반 목록·상세에서는 공개·다시 가리기와 재시도 control의 기존 role·name·state·focus·입력 동작을 유지한다. 비대화형 Reply Composer 부모 preview는 같은 gallery 배치와 fallback을 사용하되 Sensitive 공개·재시도 control을 표시하지 않는다.

**Verification**

- Sensitive 1장과 다중 gallery의 공개 전 이미지 미mount, surface 비율, 공개·다시 가리기와 Web focus 유지를 확인한다.
- 여러 이미지 중 한 URL의 loading·failure·retry가 같은 tile 경계에 격리되고 다른 Media 순서와 Post navigation이 유지되는지 확인한다.
- 정상 이미지 tile이 별도 interactive role을 갖지 않고 내부 control 실행이 부모 Post navigation을 함께 발생시키지 않는지 component test와 Web runtime에서 확인한다. Reply Composer 부모 preview의 비대화형 예외도 기존 Storybook surface에서 확인한다.

**테스트 코드 범위**

- 기존 Post Media gallery/image test 안의 Sensitive surface, 단일 tile 오류 격리·재시도, non-interactive tile과 일반 목록·상세 control semantics 및 Reply Composer 부모 preview 예외.

**테스트 필요성**

- fixed gallery로 전환할 때 기존 Sensitive·fallback의 일반 flow와 최소 높이가 surface를 깨뜨리는 회귀를 직접 방지한다.

**테스트 제외 범위**

- screen reader 자동화 harness, color-contrast debt 해소, 새 navigation mock, PROD-650 viewer interaction과 관련 없는 접근성 coverage 확대.

- [x] 2.1 Sensitive 공개 전후와 단일 tile loading·error·retry가 개수별 surface를 유지하고 정상 tile이 비상호작용이며 Reply Composer 부모 preview가 내부 control을 표시하지 않음을 검증하는 최소 회귀 테스트를 추가해 기존 구현에서 실패함을 확인한다.
- [x] 2.2 이미지·loading·error 표현이 다중 tile 경계를 채우고 Sensitive placeholder·gallery·visibility control이 승인된 높이와 기존 접근성 의미를 유지하도록 구현한다.
- [x] 2.3 targeted Post Media unit test와 Storybook a11y에서 상태 격리·control semantics·document 순서를 확인한다.

## 3. PROD-626 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- PROD-626

**Deliverable**

승인된 gallery가 Web·iOS·Android의 목록과 상세에서 검증되고, 자동화와 실제 runtime 증거가 구분된 상태로 `post-media-display` 계약과 OpenSpec change가 동기화된다.

**Guardrails**

- 자동화 통과를 Web·iOS·Android runtime 또는 screen reader 검증으로 일반화하지 않는다.
- Storybook a11y의 `color-contrast` 제외를 현재 change에서 해소하거나 전체 WCAG 적합성을 주장하지 않는다.
- PROD-650 viewer, Composer, Reply·Quote 전용 layout과 서버 Media lifecycle을 현재 완료 범위에 포함하지 않는다.
- Web·iOS·Android 필수 runtime과 delta spec 정합성이 완료되기 전에는 이 change를 archive하지 않는다. PR readiness와 change archive는 별도로 판단한다.

**Verification**

- `pnpm --filter @kosmo/app check`, Post Media unit test, Storybook build/test, ESLint·Prettier와 strict OpenSpec validation을 실행한다.
- Web에서 작은 viewport와 일반 Post 폭의 목록·상세, keyboard·pointer, Sensitive·retry를 관찰한다.
- iOS VoiceOver·touch와 Android TalkBack·touch에서 1·2·3·4장, Sensitive·retry와 화면 폭 초과 여부를 관찰한다.

**테스트 코드 범위**

- 없음. 1·2번 그룹의 최소 회귀 테스트로 전체 자동화와 runtime 검증을 수행한다.

**테스트 필요성**

- 없음. 이 그룹은 추가 coverage가 아니라 승인된 구현의 통합 증거와 플랫폼별 미검증 경계를 소유한다.

**테스트 제외 범위**

- 저장소 전체 coverage 확대, e2e 인프라 추가, unrelated fixture·snapshot·interaction test.

- [x] 3.1 App type/Relay check, 관련 unit test, Storybook build/test, ESLint·Prettier와 strict OpenSpec validation을 통과시킨다.
- [x] 3.2 Web의 작은 viewport와 일반 Post 폭에서 목록·상세 layout, keyboard·pointer, Sensitive·retry와 중첩 navigation 부재를 관찰해 기록한다.
- [ ] 3.3 iOS·Android binary에서 개수별 layout, 화면 폭, touch·VoiceOver·TalkBack, Sensitive·retry를 관찰해 기록한다.
- [ ] 3.4 모든 task와 필수 runtime 증거가 완료되면 delta spec과 canonical design 정합성을 확인하고 이 change를 archive한다. 미실행 platform이 있으면 해당 task와 archive를 완료 처리하지 않는다.

### 2026-08-03 Web runtime 증거

> 2026-08-04 geometry 결정으로 3장 4:3·다중 외곽 border 관련 관찰은 superseded되었다. 나머지 상호작용·접근성 관찰은 유지된다.

- Storybook `BodyTimeAndLayoutStates`를 390×844 Web viewport에서 관찰했다. 목록의 2장 tile은 각각 136×136, gallery는 282×138이었고 재시도 control은 실패 tile bounds 안에 남았다. 3장 gallery는 358×268.5, 4장 gallery는 358×358이었다.
- 900×900 Web viewport의 일반 600px Post 폭에서 3장은 600×450, 4장은 600×600을 유지했고 정상 tile에 button·link가 추가되지 않았다.
- Sensitive 공개·다시 가리기를 pointer로 실행했을 때 같은 control이 focus와 `expanded`를 유지했고 가림 상태에서 image가 없었다. Storybook play test의 keyboard `Enter` 경로도 같은 focus 보존을 통과했다.
- 목록의 실패 tile 재시도 후 Storybook route가 바뀌지 않았고 재시도 control과 인접 정상 이미지가 유지되었다.

## 4. PROD-626 2026-08-04 gallery geometry 정정

**Authority / Provenance**

- `docs/design/post-media-gallery.md`
- PROD-626

**Deliverable**

3장 gallery는 16:9 surface를 사용하고 모든 다중 gallery는 외곽 border 없이 내부 gap·radius를 유지한다. Sensitive 가림 상태는 같은 개수별 높이의 단일 placeholder를 사용하고 공개 뒤에만 실제 gallery tile을 표시한다.

**Guardrails**

- 1·2·4장 비율, document 순서, `cover` crop, 기존 공개·다시 가리기 control과 focus 의미를 변경하지 않는다.
- Sensitive 가림 상태에서 image byte와 실제 gallery tile·내부 gap을 렌더하지 않는다.
- PROD-650 viewer의 tile click·navigation을 선점하지 않는다.

**Verification**

- 3장 16:9, 다중 외곽 border 부재와 Sensitive tile 미렌더를 기존 component test에서 직접 검증한다.
- targeted Post Media test, 변경 없는 Relay generation을 제외한 App TypeScript check, format·lint, strict OpenSpec validation과 Web runtime geometry를 확인한다.
- 기존 iOS·Android runtime 미실행과 archive gate는 완료 처리하지 않는다.

**테스트 코드 범위**

- `apps/app/src/components/post/PostMediaGallery.test.ts`의 개수별 geometry와 Sensitive 가림 surface assertion.

**테스트 필요성**

- 이전 4:3·border·빈 tile 구현으로 돌아가는 회귀를 직접 차단한다.

**테스트 제외 범위**

- 새 screenshot harness, viewer interaction, 버튼 크기·배치, unrelated fixture·snapshot·테스트 인프라 변경.

- [x] 4.1 Linear PROD-626, canonical design과 active OpenSpec의 16:9·borderless·단일 Sensitive placeholder 계약을 동기화한다.
- [x] 4.2 변경 동작을 검증하는 기존 component test를 RED로 확인한 뒤 공용 gallery 구현을 최소 수정한다.
- [x] 4.3 targeted 자동화·strict OpenSpec validation과 localhost:5173 Web runtime geometry를 확인하고 기존 native/archive 미완료 경계를 유지한다.

### 2026-08-04 geometry 정정 검증 증거

- component test를 먼저 수정해 기존 구현에서 다중 `borderWidth: 1`과 Sensitive 빈 tile 2개 렌더를 각각 실패로 확인했다. 단일 placeholder 구현 뒤 5173 runtime에서 2장 Sensitive 높이가 0인 회귀를 발견했고, 폭 320에서 token gap 8을 제외한 높이 156을 요구하는 두 번째 RED를 확인했다.
- 초기 `onLayout` state 보완은 독립 리뷰에서 최초 0 높이와 공개 중 resize 뒤 stale 높이 위험이 확인됐다. 측정 state 대신 하나의 비시각적 sizing element가 `width: 50%`, `aspectRatio: 1`, `marginBottom: -spacing.sm / 2`로 첫 layout부터 정확한 높이를 만들도록 바꿨고, 해당 구조가 없는 구현에서 component test가 다시 실패함을 확인했다.
- 최소 구현 뒤 App unit test 169개, Storybook test 267개, `tsc --noEmit`, 변경 파일 ESLint·Prettier check와 strict OpenSpec validation이 통과했다. 전체 App `check`의 선행 Relay compiler는 Watchman 상태 파일 접근에 실패했으며 이번 변경에는 GraphQL·Relay source 변경이 없어 정정 slice의 필수 gate에서 제외했다.
- Storybook에 2장 Sensitive fixture를 추가해 최초 가림 높이 `(width - spacing.sm) / 2`, 공개 전후 동일 높이, tile 미렌더와 border 부재를 실제 browser layout에서 검증했다. Watchman 없이 Expo Web 정적 export도 다시 생성해 localhost:5173에서 Post 폭 475의 2장 일반 gallery와 2장 Sensitive 단일 placeholder가 모두 475×233.5이고 3장 gallery가 475×267.1875로 정확히 16:9임을 확인했다. 두 다중 surface의 computed border는 0px였고 가림 상태의 Sensitive tile test id는 0개였다.
- 2장 Sensitive 공개 뒤 gallery도 475×233.5를 유지했고 공개·다시 가리기 후 같은 control에 Web focus가 남았다. 버튼 크기·배치와 PROD-650 viewer interaction은 변경하지 않았다.
- 기존 iOS·Android binary runtime과 archive gate는 각각 3.3·3.4에서 계속 미완료로 유지한다.
