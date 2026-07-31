## 1. PROD-588 게시글 작성자 avatar 연결

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Profile avatar/header 공개 표현 의존성 [PROD-492](https://linear.app/byulmaru/issue/PROD-492)

**Deliverable**

홈·프로필·북마크 목록과 게시글 상세에서 일반 Post, Repost, Quote의 각 표시 위치가 해당 작성자의 실제 Ready avatar 이미지를 표시하고, URL이 없으면 기존 이니셜 fallback을 표시한다.

**Guardrails**

- 각 표시 위치는 자신이 나타내는 Profile의 avatar만 사용한다.
- 목록 48px, 상세·Source preview 40px 크기와 기존 Profile 이동·접근성 이름·layout을 유지한다.
- PROD-492가 제공하는 Profile avatar 공개 projection과 공용 Avatar를 재사용하며 API·schema·migration·Media 정책이나 별도 primitive를 복제하지 않는다.

**Verification**

- Relay compiler와 TypeScript가 일반 Post, Repost direct Source, Quote 직접 작성자·direct Source, 상세 fragment의 avatar shape를 검증한다.
- 기존 Posts Storybook surface에서 작성자별 이미지 URL과 null fallback, 크기·이동·접근성 계약을 확인한다.

- [x] 1.1 게시글 leaf fragment가 각 표시 작성자의 `avatar { id url }`을 조회하고 목록·상세·Source presentation에 독립적으로 공급하게 한다.
- [x] 1.2 실제 이미지와 이니셜 fallback 모두 기존 Avatar 크기·Profile 이동·접근성 이름·layout을 유지하게 한다.

## 2. PROD-588 공용 Profile 이미지 소비자 연결

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Profile avatar/header 공개 표현 의존성 [PROD-492](https://linear.app/byulmaru/issue/PROD-492)

**Deliverable**

현재 production의 나머지 Profile avatar 소비자와 ProfileSwitcher header가 각 Profile의 실제 Ready 이미지를 표시하고, URL이 없으면 기존 이니셜·gradient fallback을 유지한다.

**Guardrails**

- 각 leaf Relay fragment가 자신이 표시하는 Profile image field를 소유한다.
- 공용 Avatar primitive, ProfileSwitcher의 Profile 전환·actor Environment 계약, 기존 크기·layout·이동·접근성 이름을 변경하지 않는다.
- header만 기존 cover 영역에서 별도 Image로 표시하며 null이면 gradient를 유지한다.
- API·schema·migration·Media 정책, 업로드·저장·crop·thumbnail과 네트워크 이미지 로드 실패 정책을 변경하지 않는다.

**Verification**

- Relay compiler와 TypeScript가 각 production consumer의 avatar/header fragment shape를 검증한다.
- 기존 Shell·Profiles·Reactions·Posts·Notifications Storybook surface에서 서로 다른 이미지와 null fallback을 확인한다.

- [x] 2.1 `ProfileSwitcher`의 full·drawer·compact trigger와 전환 목록에 각 Profile avatar를 연결하고, 활성 Profile header 이미지·gradient fallback을 기존 전환 계약과 함께 유지한다.
- [x] 2.2 공용 `ProfileListItem`, `BottomTabBar`, `PostComposer`가 자신이 표시하는 Profile avatar를 기존 크기·이동·접근성 계약으로 사용하게 한다.
- [x] 2.3 각 `NotificationListItem` subtype fragment가 Related Profile avatar를 조회해 28px 이미지 또는 기존 이니셜 fallback을 표시하게 한다.

## 3. PROD-588 최소 자동화 검증

**Authority / Provenance**

- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)

**Deliverable**

실제 avatar/header 이미지와 null fallback, 서로 다른 Profile별 이미지 선택이 기존 production-shaped 테스트 표면에서 회귀 가능하게 검증된다.

**Guardrails**

- 테스트 코드 범위: 기존 `Posts.stories.tsx`, `Shell.stories.tsx`, `Profiles.stories.tsx`, `Reactions.stories.tsx`, `Notifications.stories.tsx`의 production fragment fixture·interaction 영역 또는 같은 동작을 더 가깝게 직접 검증하는 기존 component/unit test.
- 테스트 필요성: 각 production consumer의 올바른 이미지 선택과 URL 부재 fallback, 기존 크기·Profile 이동·접근성 이름·Profile 전환 계약을 관찰 가능한 결과로 검증한다.
- 테스트 제외 범위: 관련 없는 coverage 확대, 중복 조합, 새 test-only fixture·helper·harness, 광범위한 snapshot과 Avatar primitive 자체 테스트 변경.

**Verification**

- `pnpm --filter @kosmo/app relay`
- `pnpm --filter @kosmo/app check`
- `pnpm --filter @kosmo/app test`
- `pnpm --filter @kosmo/app test:storybook`
- `pnpm --filter @kosmo/app build-storybook`

- [x] 3.1 Posts production fixture에 서로 구분되는 Ready avatar URL과 null 상태를 추가하고 게시글 변경 동작의 최소 assertion을 작성한다.
- [x] 3.2 기존 게시글 범위의 Relay, app check, Storybook test와 static build를 통과시키고 생성 artifact가 commit 대상이 아닌지 확인한다.
- [x] 3.3 Shell·Profiles·Reactions·Posts·Notifications의 확장 소비자 fixture와 최소 assertion을 추가한다.
- [x] 3.4 확장 구현 뒤 Relay, app check, unit, Storybook test와 static build를 다시 통과시키고 생성 artifact가 commit 대상이 아닌지 확인한다.

## 4. PROD-588 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)

**Deliverable**

PROD-588이 소유한 Web runtime과 공용 코드 경로 검증을 완료하고, 상위 계약·구현·검증 증거가 일치할 때 이 change를 active specs에 동기화해 archive한다.

**Guardrails**

- PROD-492가 먼저 포함되는 stacked ancestry와 PR base를 유지한다.
- Web runtime 관찰을 Android·iOS 실제 기기 QA 완료 증거로 사용하지 않는다.
- Android·iOS 공용 React Native 코드와 자동화 결과는 확인하되 실제 기기 QA는 이번 이슈에서 미실행으로 보고한다.
- 모든 requirement와 task가 완료되기 전에는 change를 archive하지 않는다.
- archive 직전에 같은 capability를 수정하는 다른 active change와 최신 base spec을 다시 대조한다.

**Verification**

- root `pnpm dev`로 API·Web BFF·App을 기동하고 서비스 health를 확인한다.
- Ready avatar/header와 null 상태를 가진 Profile을 사용해 게시글, ProfileSwitcher, ProfileListItem, BottomTabBar, PostComposer, NotificationListItem을 Web에서 확인한다.
- 구현 중에는 `pnpm exec openspec validate show-post-author-avatar-images --strict`, archive 뒤에는 `pnpm exec openspec validate --specs --strict`를 통과시킨다.
- PR ancestry, base, hosted CI와 미실행 runtime QA를 최종 보고에 구분한다.

- [ ] 4.1 Web 공용 경로에서 각 이미지·fallback과 기존 이동·접근성·Profile 전환 동작을 수동 확인한다.
- [x] 4.2 app 전체 검증과 hosted CI를 통과시키고 Android·iOS 실제 기기 QA 미실행 여부를 기록한다.
- [ ] 4.3 canonical·Linear·delta specs·구현과 다른 active change를 다시 대조한 뒤 PROD-588 소유로 change를 archive하고 archive 후 strict validation을 통과시킨다.
