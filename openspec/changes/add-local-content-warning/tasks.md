## 1. PROD-460 Local Content Warning API 입력·저장

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `PROD-460`

**Deliverable**

Active/Normal selected Profile이 일반 Post 또는 Reply를 작성할 때 optional nullable Content Warning을 입력하고,
기존 canonical PostContent document의 summary로 검증·저장한 값을 GraphQL로 조회할 수 있다.

**Guardrails**

- `PostContentDocument` version, DB schema와 기존 단일 `Post` payload를 변경하지 않는다.
- Content Warning 전용 Post field·저장 모델·DB column을 만들지 않는다.
- Content Warning만 있고 본문과 Ready Media가 모두 없는 입력은 contentful Post로 취급하지 않는다.
- validation 실패 시 Post와 PostContent를 부분 저장하지 않는다.

**Verification**

- optional/null/유효한 Content Warning과 본문 합산 길이 validation을 API contract test로 검증한다.
- 실제 성공 GraphQL mutation에서 저장된 `PostContents.document.summary`를 확인한다.
- 기존 Content Warning 없는 일반 Post·Reply와 Media/Sensitive Media 저장 회귀를 확인한다.

- [x] 1.1 Local `createPost`가 optional nullable Content Warning을 기존 canonical summary 저장 경로에 전달하게 한다.
- [x] 1.2 본문·Content Warning 합산 normalization/길이 검증과 실패 원자성을 적용한다.
- [x] 1.3 성공 GraphQL mutation의 summary 저장과 기존 일반 Post·Reply 회귀 검증을 추가하고 통과시킨다.

**Verification Evidence (2026-08-04)**

- API createPost contract test: 2 passed.
- API PostgreSQL integration: 217 passed, 1 skipped. 성공 mutation의 `contentWarning` →
  `PostContents.document.summary` 저장을 포함한다.
- Core unit: 51 passed.

## 2. PROD-642 Composer와 공용 Content Warning 표시

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/design/reply-composer.md`
- `docs/design/accessibility.md`
- `PROD-642`

**Deliverable**

사용자는 일반 Post와 Reply에 optional Content Warning을 작성할 수 있고, Content Warning이 있는 Local·Remote Post는
모든 공용 surface에서 경고와 접근 가능한 reveal/re-hide control을 표시하며 본문과 Media를 기본 가림한다.

**Guardrails**

- 일반 Post와 Reply는 같은 Composer·mutation 입력 계약을 사용한다.
- Parent Content Warning은 새 Reply draft 초기값으로 한 번만 복사하고 이후 수정·제거를 허용한다.
- Reply surface를 여는 Parent 문맥 자체를 폐기 확인 대상으로 보호하고 pending 중 close·Parent 전환을 차단한다.
- reveal 상태는 selected Profile·session lifecycle 안에서 canonical `Post.id`로 공유하고 lifecycle 전환 시
  초기화한다.
- reveal 상태를 서버에 저장하지 않고 Sensitive Media 공개 상태와 독립적으로 유지한다.
- Web 자동화 결과를 Android/iOS 실제 runtime 완료 근거로 사용하지 않는다.

**Verification**

- 일반·Reply Composer 입력, 합산 500자 상태, 성공 reset·실패 유지와 Parent·Profile·Relay Environment 전환을
  unit/Storybook으로 검증한다.
- Home·Profile·Thread·Reply Parent·Quote/Repost Source의 초기 가림, cross-surface reveal/re-hide, remount 유지,
  lifecycle reset과 Sensitive Media 독립성을 검증한다.
- canonical Post Content root의 replay block과 reveal 전 본문·Media 미마운트를 검증한다.
- Web build와 keyboard/a11y 자동화를 통과시키고 Android/iOS assistive technology·touch/keyboard 및 원격
  federation runtime은 별도 실제 runtime evidence로 기록한다.

- [x] 2.1 일반·Reply Composer에 Content Warning 입력, 합산 길이와 API payload를 연결한다.
- [x] 2.2 direct Parent Content Warning 초기값과 독립 draft, Reply-open discard·pending lifecycle을 구현한다.
- [x] 2.3 canonical `Post.id` 기반 reveal store를 공용 Post surface와 selected Profile·session lifecycle에 연결한다.
- [x] 2.4 경고·본문·Media를 같은 가림·replay block 경계에 두고 reveal/re-hide 접근성 상태를 구현한다.
- [x] 2.5 App check·unit·Storybook·Web export와 관련 OpenSpec strict validation을 통과시킨다.
- [ ] 2.6 Android/iOS 실제 runtime에서 TalkBack/VoiceOver, touch·keyboard, safe area와 reveal/re-hide 동작을 검증한다.
- [ ] 2.7 실제 Misskey/Mastodon Content Warning federation runtime에서 저장·표시·기본 가림을 검증한다.

**Verification Evidence (2026-08-05)**

- `pnpm --filter @kosmo/app check`: 통과.
- `pnpm --filter @kosmo/app test:unit`: 192 passed.
- `pnpm --filter @kosmo/app test:storybook`: 290 passed. 초기 가림, keyboard reveal/re-hide와 replay root 검증을
  포함한다.
- `pnpm --filter @kosmo/app build`: Web export 통과.
- Reply lifecycle focused Storybook: Posts stories 77 passed.
- Android/iOS 실제 runtime과 원격 Misskey/Mastodon federation runtime은 미실행이며 이 active change의 남은
  completion gate다.

## 3. PROD-460·PROD-642 OpenSpec 정합성과 archive

**Authority / Provenance**

- `memory/issue-openspec-workflow.md`
- `PROD-460`
- `PROD-642`

**Deliverable**

두 이슈가 공동 소유하는 Content Warning 계약과 완료 증거를 별도 change에서 유지하고, 전체 declared scope와
required validation이 완료된 뒤 canonical specs를 동기화해 archive한다.

**Guardrails**

- 이미 완료·archive된 `add-local-reply-creation`에 미완료 Content Warning scope를 사후 편입하지 않는다.
- PR readiness와 OpenSpec completion을 별도로 판단한다.
- 2.6·2.7 검증과 모든 declared task가 완료되기 전에 이 change를 archive하지 않는다.

**Verification**

- `openspec validate add-local-content-warning --strict`를 통과한다.
- delta와 canonical `post`·`post-reply-ui` spec의 sync 차이를 확인한다.
- archive 직전 최신 Linear 완료 조건, 모든 task와 required validation evidence를 다시 확인한다.

- [x] 3.1 PROD-460·PROD-642 책임과 Content Warning proposal/spec/design/decision/task를 별도 active change로 정리한다.
- [x] 3.2 기존 Reply archive에서 PROD-642 사후 편입 변경을 제거하고 원래 완료 상태로 복원한다.
- [ ] 3.3 2.6·2.7과 전체 declared scope 완료 뒤 delta를 canonical specs에 동기화하고 change를 archive한다.
