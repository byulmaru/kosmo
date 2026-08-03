## 1. PROD-626 개수별 Post Media gallery

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/breakpoints.md`
- PROD-626

**Deliverable**

Post 목록과 상세가 같은 공용 renderer를 사용해 한 장의 기존 비율을 보존하고, 두 장은 token gap·외곽 border를 제외한 이미지 영역 2:1의 정사각 2열, 세 장은 4:3의 왼쪽 첫 이미지+오른쪽 2분할, 네 장은 1:1의 2×2 gallery로 document 순서대로 표시한다.

**Guardrails**

- 다중 tile은 공용 theme token의 간격·radius·border 안에서 `cover`로 표시하며 원본을 늘이거나 찌그러뜨리지 않는다.
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

- [ ] 1.1 개수별 gallery layout·crop·접근성 결정을 적용되는 `docs/design` canonical 문서에 기록한다.
- [ ] 1.2 한 장의 기존 비율, 두 장의 token 공간을 제외한 정사각 tile geometry와 3·4장 구조·순서·surface 비율을 직접 검증하는 최소 회귀 테스트와 3장 Storybook 사례를 추가하고 기존 구현에서 실패함을 확인한다.
- [ ] 1.3 승인된 개수별 surface와 tile 배치를 공용 Post Media presentation에 구현하되 한 장의 측정 비율 경로와 목록·상세 소비자 계약을 유지한다.
- [ ] 1.4 targeted Post Media unit test와 Storybook 검증을 통과시키고 1·2·3·4장 visual geometry를 확인한다.

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
- 한 장 가림 surface는 1:1이고 공개 뒤 기존 단일 이미지 비율을 사용한다. 두 장은 정사각 tile에서 계산한 높이, 세 장은 4:3, 네 장은 1:1 surface를 공개 전후에 유지한다.
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

- [ ] 2.1 Sensitive 공개 전후와 단일 tile loading·error·retry가 개수별 surface를 유지하고 정상 tile이 비상호작용이며 Reply Composer 부모 preview가 내부 control을 표시하지 않음을 검증하는 최소 회귀 테스트를 추가해 기존 구현에서 실패함을 확인한다.
- [ ] 2.2 이미지·loading·error 표현이 다중 tile 경계를 채우고 Sensitive placeholder·gallery·visibility control이 승인된 높이와 기존 접근성 의미를 유지하도록 구현한다.
- [ ] 2.3 targeted Post Media unit test와 Storybook a11y에서 상태 격리·control semantics·document 순서를 확인한다.

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

- [ ] 3.1 App type/Relay check, 관련 unit test, Storybook build/test, ESLint·Prettier와 strict OpenSpec validation을 통과시킨다.
- [ ] 3.2 Web의 작은 viewport와 일반 Post 폭에서 목록·상세 layout, keyboard·pointer, Sensitive·retry와 중첩 navigation 부재를 관찰해 기록한다.
- [ ] 3.3 iOS·Android binary에서 개수별 layout, 화면 폭, touch·VoiceOver·TalkBack, Sensitive·retry를 관찰해 기록한다.
- [ ] 3.4 모든 task와 필수 runtime 증거가 완료되면 delta spec과 canonical design 정합성을 확인하고 이 change를 archive한다. 미실행 platform이 있으면 해당 task와 archive를 완료 처리하지 않는다.
