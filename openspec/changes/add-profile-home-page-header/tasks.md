## 1. PROD-949 계약 정렬

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `PROD-949`

**Deliverable**

공개 Profile Home의 PageHeader, 긴 표시 이름, missing·loading·query error 상태와 소유권 계약이 canonical 문서와 OpenSpec에서 일치한다.

**Guardrails**

- ProfileHero·게시물·관계 목록과 일반 PageHeader reflow의 제외 범위를 유지하고, loading·query error는 기존 fallback 본문·query lifecycle을 유지한 채 route chrome만 추가한다.
- Figma target을 Production·Native runtime 완료 증거로 일반화하지 않는다.

**Verification**

- canonical 문서와 proposal·delta spec·design·decisions·tasks의 resolved·missing·ellipsis·ownership 내용을 대조한다.
- OpenSpec strict validation과 formatting을 통과한다.

- [x] 1.1 PageHeader·breakpoint·Figma canonical 문서를 PROD-949 계약으로 정렬한다.
- [x] 1.2 OpenSpec artifact에 구현·보존·검증·archive 경계를 기록한다.

## 2. PROD-949 공용 PageHeader 제목 계약

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/figma.md`
- `PROD-949`

**Deliverable**

Profile Home의 동적 표시 이름은 공용 PageHeader에서 한 줄 tail ellipsis로 표시되고, 다른 text 제목은 기존 여러 줄 reflow를 유지한다.

**Guardrails**

- 접근성 heading은 생략하지 않은 전체 표시 이름을 유지한다.
- 새 Profile 전용 header나 외부 의존성을 추가하지 않는다.

**Verification**

- 공용 PageHeader 행동 테스트에서 기본 text 제목의 무제한 reflow와 명시적 한 줄 tail ellipsis를 함께 확인한다.
- 타입 검사와 formatting을 통과한다.

- [x] 2.1 공용 PageHeader에 기본 동작을 바꾸지 않는 한 줄 tail ellipsis 선택 경계를 구현한다.
- [x] 2.2 기본값·opt-in 제목 동작과 접근성 heading을 행동 테스트로 검증한다.

## 3. PROD-949 Profile Home 조립과 모바일 Web 소유권

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `PROD-949`

**Deliverable**

resolved Profile Home은 표시 이름 PageHeader, Hero와 게시물을 순서대로 표시하고, loading·query error·missing 상태는 빈 제목 PageHeader와 기존 fallback 본문을 표시한다. 모바일 Web은 route PageHeader 하나만 표시한다.

**Guardrails**

- 뒤로가기는 기존 route history 동작을 사용한다.
- loading·query error의 기존 fallback 본문·query lifecycle, Profile action, Hero·게시물 identity와 관계 route를 바꾸지 않는다.
- Native에서는 기존 Profile layout scroll owner 안에 PageHeader와 본문을 함께 둔다.

**Verification**

- Profile route 행동 테스트에서 resolved title·Hero·게시물 identity, missing chrome·본문 배타성, loading skeleton·query-error retry와 각 상태의 back action을 확인한다.
- shell layout 행동 테스트에서 모바일 Web 최상위 `@` Profile Home만 route-owned header로 분류하는지 확인한다.
- Relay artifact와 타입 검사를 갱신·실행한다.

- [x] 3.1 resolved·missing Profile Home에 승인된 PageHeader와 기존 본문을 조립한다.
- [x] 3.2 모바일 Web에서 Profile Home의 셸 헤더 중복을 막고 nested·비Profile route를 보존한다.
- [x] 3.3 route·shell·Relay 행동 검증을 추가하고 관련 check를 통과시킨다.
- [x] 3.4 최상위 Profile Home의 loading·query error에 빈 제목 PageHeader를 추가하고 기존 fallback·retry 동작을 행동 테스트로 검증한다.

## 4. PROD-949 통합 검증과 완료

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `PROD-949`

**Deliverable**

공용 UI와 실제 Profile Home에서 계약을 검증하고, PR readiness와 OpenSpec 전체 완료 상태를 별도로 기록한다.

**Guardrails**

- Web viewport 증거를 Android/iOS runtime 또는 assistive technology 완료로 일반화하지 않는다.
- 전체 task와 required validation이 끝나기 전에는 change를 archive하지 않는다.

**Verification**

- targeted unit·Relay·type 검사, OpenSpec strict validation과 `git diff --check`를 통과한다.
- Web 390·768·1280px에서 resolved·긴 이름·missing 상단 구조와 중복 header 부재를 확인한다.
- 가능한 Android/iOS runtime과 VoiceOver·TalkBack에서 PageHeader 순서·전체 제목·뒤로가기를 확인하고 미실행 항목은 명시한다.
- 독립 구현 리뷰에서 scope·접근성·route ownership·기존 상태 회귀와 검증 공백을 확인한다.

- [ ] 4.1 targeted automated check와 OpenSpec strict validation을 실행하고 실패를 해소한다.
- [x] 4.2 Web 390·768·1280px에서 resolved·긴 이름·missing 상태를 시각·상호작용 검증한다.
- [ ] 4.3 가능한 Android/iOS runtime·VoiceOver·TalkBack QA를 실행하고 미확인 범위를 기록한다.
- [x] 4.4 독립 구현 리뷰의 finding을 반영하고 PR readiness와 남은 OpenSpec completion gap을 분리해 기록한다.
- [ ] 4.5 전체 task와 required validation이 완료된 뒤 main spec 동기화와 archive를 수행한다.

**Verification Record (2026-09-10)**

- PageHeader·Profile route·shell layout targeted unit test 28/28, Relay compiler, Expo Web production export,
  Prettier, `git diff --check`와 OpenSpec strict validation을 통과했다.
- 전체 App TypeScript 검사는 이 변경과 무관한 기존
  `SettingsLinkRow.test.ts:92`의 `href` string 타입 오류 한 건으로 실패해 4.1은 완료 처리하지 않았다.
- 실제 Web에서 resolved·긴 이름·missing Profile Home을 390·768·1280px로 확인했다. 각 viewport에서
  route PageHeader 하나와 뒤로가기 하나만 표시됐고, 긴 제목은 전체 접근성 값을 유지한 채 한 줄 tail
  ellipsis로 줄었으며 missing 상태에는 Hero·목록·메뉴 header가 없었다.
- 독립 구현 재리뷰는 확정 finding 없이 통과했다. 이 PR의 scope는 리뷰 가능한 상태지만 Android/iOS,
  VoiceOver·TalkBack runtime은 실행하지 않아 4.3과 전체 OpenSpec archive gate는 남긴다.

**Verification Record (P1, 2026-09-10)**

- Profile route 행동 테스트 9/9를 통과해 canonical loading·query error의 `PageHeader → 기존 fallback body`
  순서, 빈 제목, back callback과 query retry를 확인했다.
