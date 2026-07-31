## 1. 초기 전체-target 구현 기록 (Superseded)

이 section은 2026-07-31 시각 검토 전에 완료한 구현과 검증의 역사적 기록이다. 현재 deliverable과 완료
계약은 아래 `2. 시각 검토 보정` section이 대체한다.

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/post-action-bar.md`
- PROD-595

**Deliverable**

최초 구현에서는 Web의 비터치 pointer가 Post Action control에 hover하면 기존 target 전체가 중립 `surface`
background로 드러나고, active·pressed·blocked 상태와 Action Bar geometry가 유지됐다.

**Guardrails**

- Reply·Repost·Reaction·Bookmark는 기존 50×28 target, More는 기존 28×28 target을 변경하지 않는다.
- pending·disabled·resolution-required에는 hover background를 표시하지 않는다.
- Web touch와 Native에 hover 전용 표현을 추가하지 않는다.
- action 기능·count·mutation·execution eligibility·Relay cache와 ThemeProvider를 변경하지 않는다.
- 새 색상 token이나 runtime dependency를 추가하지 않는다.
- dark runtime은 현재 검증 범위가 아니므로 실행 완료를 주장하지 않는다. 이 문장은 초기 구현 당시의
  역사적 검증 경계이며 현재 archive gate로 사용하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 `PostActionBar` Storybook interaction 한 파일에서 hover background, target shape,
  active·pressed 보존, blocked 미표시와 geometry 불변을 직접 검증한다.
- 테스트 필요성: 사용자에게 보이는 Web hover 동작과 기존 state·layout 회귀 위험을 관찰 가능한 DOM style과
  geometry로 증명한다.
- 테스트 제외 범위: 새 fixture·helper·harness, 중복 action 조합, snapshot, ThemeProvider·dark mode 테스트,
  Web touch·Android·iOS runtime test와 action 기능·mutation test.
- App typecheck, targeted Storybook interaction과 static Storybook build를 통과시킨다.
- light Web runtime에서 pointer hover와 인접 target 비중첩을 관찰한다. dark·Web touch·Native runtime은
  미실행으로 보고한다.

**Verification Record (2026-07-31)**

- `@kosmo/app check`는 Watchman의 FSEvents 시작 실패를 피하도록 Watchman을 PATH에서 제외한 동일 script로
  실행해 Relay compiler(87 reader, 53 normalization, 94 operation text)와 TypeScript를 통과했다.
- `PostActionBar.stories.tsx` targeted Storybook interaction 14/14와 static Storybook build, OpenSpec strict
  validation을 통과했다.
- light Web Storybook에서 Reply의 `surface` hover가 50×28 pill로 표시되고 More 28×28, active Bookmark
  50×28, blocked control 미표시와 모든 toolbar의 target 비중첩을 관찰했다.
- dark runtime, Web touch, Android와 iOS runtime은 실행하지 않았다. 이 미실행 범위는 현재 계약에서
  명시적으로 제외됐으므로 이후 archive 자체를 막는 사유로 사용하지 않는다.
- 구현과 검증은 canonical design, 이 change의 spec·decision, 작업 시작 시 확인한 live PROD-595 범위와
  일치한다. Linear connector가 검증 중 unavailable 상태가 되어 status·본문 writeback은 완료하지 못했다.

- [x] 1.1 공통 Post Action control에 승인된 Web 비터치 hover target 표현을 구현한다.
- [x] 1.2 가장 가까운 기존 Storybook interaction에 hover와 핵심 상태·geometry 회귀 검증을 추가한다.
- [x] 1.3 App check, targeted Storybook interaction, static Storybook build와 light Web 수동 관찰을 수행하고
      미실행 platform 검증을 구분해 기록한다.
- [x] 1.4 구현과 검증 결과를 canonical 문서·Linear·OpenSpec에 대조한다. 이 초기 판단은 superseded됐으며
      제외된 runtime 검증은 현재 archive gate가 아니다.

## 2. 시각 검토 보정 — glyph 중심 원형과 Reaction like tint (Superseded)

이 section은 2026-07-31 중간 시각 결정을 완료했던 역사 기록이다. 아래 `surface` deliverable과 verification은
section 3의 최종 `primary` 또는 `like` tint 계약으로 대체됐으며 현재 deliverable로 해석하지 않는다.

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/post-action-bar.md`
- PROD-595의 2026-07-31 승인된 본문

**Deliverable**

Web의 비터치 pointer가 Post Action control에 hover하면 click target은 유지된 채 glyph 중심 28×28 원형만
표시된다. 일반 action은 중립 `surface`를 사용한다. Reaction은 30% opacity의 `like` background와 불투명
`like` heart foreground를 함께 사용하며 selected Reaction heart도 불투명 `like`를 유지한다.

**Guardrails**

- Reply·Repost·Reaction·Bookmark의 기존 50×28 target과 More의 기존 28×28 target을 변경하지 않는다.
- 28×28 hover visual은 count와 icon의 layout 간격을 바꾸지 않고 pointer event를 받지 않는다.
- hover visual은 count를 포함해 늘어나는 pill이 아니다. 고정 28×28 원형과 기존 16px glyph·4px count gap을
  함께 유지한다.
- pending·disabled·resolution-required에는 hover background를 표시하지 않는다.
- Web touch와 Native에 hover 전용 표현을 추가하지 않는다.
- action 기능·count·mutation·execution eligibility·Relay cache와 ThemeProvider를 변경하지 않는다.
- Reply·Repost·Bookmark·More의 action별 tint, 새 색상 token과 runtime dependency를 추가하지 않는다.
- dark runtime, Web touch, Android와 iOS runtime은 현재 검증 범위가 아니므로 실행 완료를 주장하지 않는다.
  이 제외 범위는 현재 deliverable 완료 뒤 archive를 막는 별도 gate가 아니다.

**Verification**

- 테스트 코드 범위: 기존 `PostActionBar.stories.tsx`의 `ActionBarCatalog` interaction에서 glyph 중심 28×28
  원형, `surface`, Reaction의 30% `like` background와 불투명 `like` foreground, click target과 icon-count
  geometry, selected·pressed 보존과 blocked 미표시를 검증한다.
- 테스트 필요성: 사용자에게 보이는 보정 동작과 click target·layout 회귀 위험을 관찰 가능한 DOM style과
  geometry로 증명한다.
- 테스트 제외 범위: 새 fixture·helper·harness, 중복 action 조합, snapshot, ThemeProvider·dark mode 테스트,
  Web touch·Android·iOS runtime test와 action 기능·mutation test.
- App check, targeted Storybook interaction, static Storybook build와 OpenSpec strict validation을 통과시킨다.
- light Web browser interaction에서 hover 원형과 인접 target 비중첩을 검증하고 API·BFF를 포함한 app dev
  endpoint를 시각 검토 가능 상태로 유지한다. dark·Web touch·Native runtime은 미실행으로 보고한다.

**Verification Record (2026-07-31, X-style 보정)**

- `@kosmo/app test`를 최신 부모 위 게시 직전 트리에서 실행해 Relay compiler(92 reader, 58 normalization,
  99 operation text)와 TypeScript, unit 137/137, static Storybook build, Storybook browser interaction
  256/256을 통과했다. Expo dev server가 만든 ignored router type은 원본을 임시 경로에 보존한 채 clean
  check에서 제외하고 즉시 복원했다.
- `ActionBarCatalog`는 미선택 Reaction hover에서 background `like` opacity `0.3`, heart의 불투명 `like`
  stroke와 hover 종료 뒤 default 색 복귀를 검증한다. selected Reaction은 hover 전·중·후 불투명 `like`
  stroke·fill을 유지하며, 원형 background만 hover 동안 opacity `0.3`으로 표시된다.
- 변경 TypeScript 파일의 ESLint, 변경 전체의 Prettier, `git diff --check`, OpenSpec strict validation을
  통과했다.
- API `3300`, Web BFF `5474`, App `5473`의 health와 App `/home`이 모두 HTTP 200인 상태로 시각 검토용 dev를
  재기동했다.
- dark runtime, Web touch, Android와 iOS runtime은 실행하지 않았다. 승인된 제외 범위이며 완료 증거로
  주장하지 않는다.

- [x] 2.1 canonical과 Linear에 승인된 glyph 중심 원형 및 Reaction 30% `like` background·불투명 foreground
      계약을 반영한다.
- [x] 2.2 기존 Storybook interaction을 새 hover·selected Reaction 계약으로 수정하고 opacity `1` 실패를
      RED로 확인한다.
- [x] 2.3 공통 Post Action control과 Reaction 연결에 background opacity와 hover foreground를 분리하는 최소
      구현을 적용하고 targeted interaction을 GREEN으로 만든다.
- [x] 2.4 App 전체 test, Storybook browser interaction, static Storybook build, OpenSpec strict와 light Web dev
      가동을 검증하고 미실행 platform 검증을 구분해 기록한다.
- [x] 2.5 구현과 검증 결과를 canonical·Linear·OpenSpec에 대조하고 미실행 runtime 범위와 archive 판단을
      분리해 기록한다.

## 3. 최종 시각 검토 보정 — 일반 action primary tint와 foreground layer

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/post-action-bar.md`
- PROD-595의 2026-07-31 최종 시각 검토

**Deliverable**

Web의 비터치 pointer가 Reply, Repost, Bookmark 또는 More에 hover하면 glyph 중심 28×28 원형은 30% opacity의
semantic `primary` background로 표시되고 glyph는 불투명 `primary` foreground로 그 위에 표시된다. Reaction은
같은 표현에 기존 `like`를 사용한다. Reply와 Repost의 count는 hover tint에 포함하지 않고 기존 색을 유지한다.

**Guardrails**

- Reply·Repost·Reaction·Bookmark의 기존 50×28 target과 More의 기존 28×28 target을 변경하지 않는다.
- 28×28 background는 count와 glyph를 덮거나 pointer event를 받지 않으며 glyph는 명시적인 상위 layer에 둔다.
  Reply·Repost count 색은 hover 전후에 바뀌지 않는다.
- pending·disabled·resolution-required, Web touch와 Native의 기존 제외 경계를 유지한다.
- action 기능·count·mutation·execution eligibility·Relay cache·ThemeProvider·dependency를 변경하지 않는다.
- Reply·Repost·Bookmark·More를 서로 다른 tint로 분리하는 후속 범위는 포함하지 않는다.

**Verification**

- 기존 `ActionBarCatalog` interaction에서 Reply·Repost·Bookmark·More의 30% `primary` background와 불투명
  `primary` foreground, background `z-index: 0`과 glyph `z-index: 1`, Reply·Repost count 색 유지 및 hover 종료
  시 default foreground 복귀를 검증한다.
- Reaction의 30% `like` background·불투명 `like` foreground와 selected 표현을 그대로 검증한다.
- App 전체 test, 변경 파일 lint·format, OpenSpec strict, light Web dev 시각 관찰을 수행한다.
- dark·Web touch·Android·iOS runtime은 미실행으로 구분한다.

- [x] 3.1 새 `primary` hover와 glyph foreground layer 계약을 Storybook에 추가하고 기존 `surface` 구현에서
      RED를 확인한다.
- [x] 3.2 공통 control의 기본 hover tint를 `primary` 30%로 바꾸고 glyph를 background 상위 layer에 두어
      targeted Storybook interaction을 GREEN으로 만든다.
- [x] 3.3 canonical과 OpenSpec proposal·design·decision·spec을 최종 시각 결정에 맞춘다.
- [x] 3.4 App 전체 test, lint·format, OpenSpec strict와 light Web dev 검증을 완료한다.
- [x] 3.5 Linear와 PR 본문을 최종 계약·검증 결과에 맞춰 동기화한다.
- [x] 3.6 리뷰에서 확인한 count hover tint 회귀를 Storybook RED로 재현하고 glyph와 count 색을 분리하며
      background·glyph layer 순서 assertion을 보강한다.

**Verification Record (2026-07-31, primary tint 보정)**

- `@kosmo/app test`에서 Relay compiler(92 reader, 58 normalization, 99 operation text), TypeScript, unit,
  static Storybook build와 Storybook browser interaction 19 files·256/256을 통과했다. Storybook의 기존 Relay
  fixture warning·error boundary log·React act warning은 남지만 실패는 없다.
- 새 hover 계약을 먼저 실행해 기존 `surface` 구현에서 `primary` background 기대가 실패하는 RED를 확인했고,
  기본 `primary` 30% background·불투명 foreground와 glyph `z-index: 1` 구현 뒤 GREEN을 확인했다.
- 리뷰에서 발견한 Reply·Repost count hover tint 회귀를 Storybook RED로 재현하고 glyph와 count 색을 분리한 뒤
  256/256 GREEN을 확인했다. background `z-index: 0`과 glyph `z-index: 1`도 함께 고정했다.
- 변경 TypeScript의 ESLint, 변경 전체의 Prettier, `git diff --check`와 OpenSpec strict validation을 통과했다.
- API `3300`, Web BFF `5474`를 유지한 채 App `5473`을 현재 worktree 소스로 재기동했고, 사용자 브라우저의
  `/home`에서 최신 glyph foreground layer가 로드됨을 확인했다.
- dark runtime, Web touch, Android와 iOS runtime은 실행하지 않았다. 승인된 제외 범위이며 완료 증거로
  주장하지 않는다.
