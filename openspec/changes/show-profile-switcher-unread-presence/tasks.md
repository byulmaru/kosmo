## 1. 기존 data ownership 보존

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-643`
- `PROD-786`

**Deliverable**

ProfileSwitcher는 기존 shell query와 Relay Store의 Profile별 `unreadNotificationCount`를 그대로 사용한다.

**Guardrails**

- 별도 query, snapshot, client-side count 보정, schema·resolver·DB 변경을 추가하지 않는다.
- selected Profile shell badge와 notification lifecycle을 변경하지 않는다.

**Verification**

- 기존 fragment와 generated artifact에서 Profile별 count ownership을 확인한다.
- Profile 전환 E2E에서 기존 actor·shell badge·알림 목록 수렴을 유지한다.

- [x] 1.1 `ProfileSwitcher_query.me.profiles[].unreadNotificationCount`와 기존 Relay ownership을 재사용한다.
- [x] 1.2 별도 query·snapshot·client count 보정과 schema·DB·dependency 변경을 추가하지 않는다.

## 2. PROD-786 계약 정렬

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `DSN-40`
- `PROD-786`

**Deliverable**

기존 PROD-643 avatar-dot 계약을 닫힌 Other Unread indicator와 열린 non-selected 숫자 badge 계약으로
supersede하고 Production 이관 상태를 canonical 문서에 반영한다.

**Guardrails**

- selected 행은 기존 check를 유지한다.
- Profile 생성·선택·actor lifecycle과 excluded Push·realtime·OS badge 범위를 넓히지 않는다.

**Verification**

- proposal, delta spec, design, decisions와 tasks가 같은 closed·opened 계약을 설명하는지 확인한다.
- OpenSpec strict validation과 formatting을 통과한다.

- [x] 2.1 OpenSpec proposal·spec·design·decisions·tasks를 PROD-786 provenance와 최신 계약으로 정렬한다.
- [x] 2.2 `docs/design/breakpoints.md`의 Profile별 Unread 상태를 Production current로 갱신한다.

## 3. 공용 UI와 Production 동기화

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `PROD-855`
- `PROD-786`

**Deliverable**

Target과 실제 ProfileSwitcher가 같은 Other Unread source, closed indicator와 open numeric badge를 사용한다.

**Guardrails**

- closed source는 selected Profile을 제외한다.
- open 상태에는 closed indicator를 표시하지 않는다.
- ProfilePicker의 selected check, label, hit target, 선택 handler와 Post Composer 동작을 유지한다.

**Verification**

- 테스트 코드 범위: `ProfileSwitcher.stories.tsx`, `Shell.stories.tsx`, `profile-switcher.e2e.ts`의 기존
  ProfileSwitcher 계약.
- 테스트 필요성: Other Unread source, full·compact geometry, open 중복 방지, 1~9·9+ badge와 actor 수렴.
- 테스트 제외 범위: 새 fixture/helper/harness, 관련 없는 ProfilePicker consumer 조합과 coverage 확대.

- [x] 3.1 `ProfileSwitcherTarget`의 closed indicator를 selected count가 아닌 Other Unread에서 파생한다.
- [x] 3.2 Production `ProfileSwitcher`에 full·drawer 8px dot, compact 12px halo dot과 open 숨김을 연결한다.
- [x] 3.3 `ProfilePicker`의 avatar dot을 non-selected 24px `1`~`9`·`9+` badge로 교체하고 selected check와
      boolean accessible name을 유지한다.

## 4. 검증과 완료

**Authority / Provenance**

- `docs/design/accessibility.md`
- `PROD-786`

**Deliverable**

공용 UI와 실제 Production surface의 자동·수동 증거를 분리해 확보하고, 전체 change 완료 조건을 충족할 때만
archive한다.

**Guardrails**

- Storybook 정적 증거를 Web·Android·iOS runtime 완료로 일반화하지 않는다.
- 실행하지 못한 platform과 assistive technology는 미확인으로 명시한다.

**Verification**

- Target·Shell Storybook interaction, app Relay/type/unit/Storybook build, targeted Web E2E를 실행한다.
- Web full·compact closed/open geometry, pointer·keyboard·focus를 실제 렌더에서 확인한다.
- 독립 구현 리뷰와 OpenSpec strict validation을 통과한다.

- [x] 4.1 Target과 Production Shell Storybook에서 selected `0`·other 양수, full·compact geometry, open 숨김,
      selected check와 `1`·`9+` badge를 검증한다.
- [x] 4.2 targeted Web E2E에서 closed indicator → open badge → Profile 선택 → 기존 shell badge·알림 목록
      수렴을 검증한다.
- [x] 4.3 app Relay/type/unit/Storybook tests·build와 OpenSpec strict validation을 실행하고 실패를 해소한다.
- [ ] 4.4 Web runtime 시각·keyboard·focus QA와 가능한 Android/iOS runtime·TalkBack·VoiceOver QA를 실행해
      결과와 미확인 항목을 기록한다.
- [x] 4.5 독립 구현 리뷰에서 scope·data ownership·접근성·shared consumer 회귀·검증 누락을 확인하고 finding을
      반영한다.
- [ ] 4.6 전체 task와 필요한 runtime QA가 완료된 뒤 main spec 동기화와 archive를 수행한다.
