## 1. PROD-588 게시글 작성자 avatar 연결

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Profile avatar 공개 표현 의존성 [PROD-492](https://linear.app/byulmaru/issue/PROD-492)

**Deliverable**

홈·프로필·북마크 목록과 게시글 상세에서 일반 Post, Repost, Quote의 각 표시 위치가 해당 작성자의 실제 Ready avatar 이미지를 표시하고, URL이 없으면 기존 이니셜 fallback을 표시한다.

**Guardrails**

- 각 표시 위치는 자신이 나타내는 Profile의 avatar만 사용한다.
- 목록 48px, 상세·Source preview 40px 크기와 기존 Profile 이동·접근성 이름·layout을 유지한다.
- PROD-492가 제공하는 Profile avatar 공개 projection과 공용 Avatar를 재사용하며 API·schema·migration·Media 정책이나 별도 primitive를 복제하지 않는다.
- avatar 업로드·저장, 기본 avatar asset, 네트워크 이미지 로드 실패 정책과 비게시글 소비자는 변경하지 않는다.

**Verification**

- Relay compiler와 TypeScript가 일반 Post, Repost direct Source, Quote 직접 작성자·direct Source, 상세 fragment의 avatar shape를 검증한다.
- 기존 Storybook surface에서 작성자별 이미지 URL과 null fallback, 크기·이동·접근성 계약을 확인한다.

- [ ] 1.1 게시글 leaf fragment가 각 표시 작성자의 `avatar { id url }`을 조회하고 목록·상세·Source presentation에 독립적으로 공급하게 한다.
- [ ] 1.2 실제 이미지와 이니셜 fallback 모두 기존 Avatar 크기·Profile 이동·접근성 이름·layout을 유지하게 한다.

## 2. PROD-588 최소 자동화 검증

**Authority / Provenance**

- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)

**Deliverable**

작성자 avatar 이미지 연결과 null fallback, 서로 다른 직접 작성자·Source 작성자 선택이 기존 production-shaped 테스트 표면에서 회귀 가능하게 검증된다.

**Guardrails**

- 테스트 코드 범위: `apps/app/src/stories/Posts.stories.tsx`의 기존 production fragment fixture·interaction 영역 또는 같은 동작을 더 가깝게 직접 검증하는 기존 component/unit test 한 곳.
- 테스트 필요성: 일반 목록·상세, 순수 Repost direct Source, Quote 직접 작성자·direct Source의 올바른 이미지 선택과 URL 부재 fallback, 기존 크기·Profile 이동·접근성 이름을 관찰 가능한 결과로 검증한다.
- 테스트 제외 범위: 관련 없는 coverage 확대, 중복 조합, 새 test-only fixture·helper·harness, 광범위한 snapshot, Avatar primitive와 비게시글 소비자 테스트 변경.

**Verification**

- `pnpm --filter @kosmo/app relay`
- `pnpm --filter @kosmo/app check`
- `pnpm --filter @kosmo/app test:storybook`
- `pnpm --filter @kosmo/app build-storybook`

- [ ] 2.1 기존 production fragment fixture에 서로 구분되는 Ready avatar URL과 null avatar 상태를 추가하고 변경 동작의 최소 assertion을 작성한다.
- [ ] 2.2 Relay, app check, Storybook test와 static build를 통과시키고 생성 artifact가 commit 대상이 아닌지 확인한다.

## 3. PROD-588 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- [PROD-588](https://linear.app/byulmaru/issue/PROD-588)

**Deliverable**

PROD-588이 소유한 Web runtime과 공용 코드 경로 검증을 완료하고, 상위 계약·구현·검증 증거가 일치할 때 이 change를 active specs에 동기화해 archive한다.

**Guardrails**

- PR #435가 먼저 포함되는 stacked ancestry와 PR base를 유지한다.
- Web runtime 관찰을 Android·iOS 실제 기기 QA 완료 증거로 사용하지 않는다.
- Android·iOS 공용 React Native 코드와 자동화 결과는 확인하되 실제 기기 QA는 이번 이슈의 별도 승인 범위가 아니면 미실행으로 보고한다.
- 모든 requirement와 task가 완료되기 전에는 change를 archive하지 않는다.

**Verification**

- root `pnpm dev`로 API·Web BFF·App을 기동하고 서비스 health를 확인한다.
- Ready avatar와 null avatar를 가진 작성자의 홈·프로필·북마크 목록, 게시글 상세, Repost·Quote presentation을 Web에서 확인한다.
- 구현 중에는 `pnpm exec openspec validate show-post-author-avatar-images --strict`, archive 뒤에는 `pnpm exec openspec validate --specs --strict`를 통과시킨다.
- PR ancestry, base, hosted CI와 미실행 runtime QA를 최종 보고에 구분한다.

- [ ] 3.1 Web 공용 경로에서 이미지·fallback·작성자별 Source 선택과 기존 이동·접근성 동작을 수동 확인한다.
- [ ] 3.2 app 전체 검증과 hosted CI를 통과시키고 Android·iOS 실제 기기 QA 미실행 여부를 기록한다.
- [ ] 3.3 canonical·Linear·delta specs·구현을 다시 대조한 뒤 PROD-588 소유로 change를 archive하고 archive 후 strict validation을 통과시킨다.
