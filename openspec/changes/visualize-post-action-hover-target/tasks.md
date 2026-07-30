## 1. PROD-595 Web Post Action hover target

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/post-action-bar.md`
- PROD-595

**Deliverable**

Web의 비터치 pointer가 Post Action control에 hover하면 기존 target 전체가 중립 `surface` background로
드러나고, active·pressed·blocked 상태와 Action Bar geometry는 유지된다.

**Guardrails**

- Reply·Repost·Reaction·Bookmark는 기존 50×28 target, More는 기존 28×28 target을 변경하지 않는다.
- pending·disabled·resolution-required에는 hover background를 표시하지 않는다.
- Web touch와 Native에 hover 전용 표현을 추가하지 않는다.
- action 기능·count·mutation·execution eligibility·Relay cache와 ThemeProvider를 변경하지 않는다.
- 새 색상 token이나 runtime dependency를 추가하지 않는다.
- dark runtime은 현재 검증 범위가 아니므로 실행 완료를 주장하지 않고 이 change를 archive하지 않는다.

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

- [ ] 1.1 공통 Post Action control에 승인된 Web 비터치 hover target 표현을 구현한다.
- [ ] 1.2 가장 가까운 기존 Storybook interaction에 hover와 핵심 상태·geometry 회귀 검증을 추가한다.
- [ ] 1.3 App check, targeted Storybook interaction, static Storybook build와 light Web 수동 관찰을 수행하고
      미실행 platform 검증을 구분해 기록한다.
- [ ] 1.4 구현과 검증 결과를 canonical 문서·Linear·OpenSpec에 대조하고 dark runtime 미검증 때문에 change를
      active로 유지한다.
