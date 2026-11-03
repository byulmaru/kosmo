## Session Work

현재 사용자 합의와 PROD-1234의 결과를 구현하고 검증하는 데 쓰는 메모다. 필요 없는 구현 제안은 줄이거나 바꾼다.

- [ ] 1.0 Local·Remote 공통 `bytea` 기반 binary fractional ordering key의 schema와 전환을 준비한다. 기존 Local `id ASC`·Remote `position ASC, id ASC`의 membership·상대 순서를 보존하는 초기화, null key 혼재·구버전 read/write·rollback 범위와 필요한 전달 단위를 확인한다. legacy 정수는 전환 호환용으로만 다루고 제거는 기존 contract gate를 따른다. 새 rollout·완료 범위의 결정이 필요하면 사용자에게 확인한 뒤 진행한다.
- [ ] 1.1 `packages/core/services/profile-pin.ts`에서 membership를 보존하는 binary 순서 저장을 구현하고, 기존 Local 순서·새 pin·unpin과 공통 key의 관계를 맞춘다. 순서가 실제로 바뀐 commit 뒤 기존 Profile Update effect를 재사용한다.
- [ ] 1.2 Profile의 순서 변경 GraphQL mutation과 Local `pinnedPosts` 조회를 연결한다. 기존 `MEMBER`·selected Profile·Active/Normal·조회 권한을 유지하고 실제 Profile payload와 schema를 동기화한다.
- [ ] 1.3 `packages/fedify/src/local-profile-featured.ts`의 정렬·cursor·count와 Remote `pinnedPosts` 조회를 공통 binary 순서에 맞춘다. `remote-featured-snapshot.ts`에서 수신 순서대로 key를 생성하고 snapshot 교체·빈 목록·`remote-actor-materialization.ts`의 Featured URI 제거 경로를 전환한다. Remote 판별에 key의 null 여부를 사용하지 않고 기존 원격 순서·권한·원자적 교체를 유지한다.
- [ ] 1.4 Profile pinned segment에 메뉴 이동을 연결한다. 기존 pin/unpin·copy·delete 순서, 경계 방향 생략, pending 중복 방지, 실패·재시도와 같은 Post More trigger focus 복귀를 유지한다. 서버 응답을 현재 요청 actor Store에 반영한다.
- [ ] 1.5 아래 Verification Evidence의 동작 검증을 추가·수행한다. 실제 schema·DB·Relay·공용 메뉴를 실행하며 구현 문구 검색을 테스트로 대신하지 않는다.
- [ ] 1.6 구현 결과에 맞춰 canonical·schema·문서와 이 세션 메모를 정렬하고 실제 검증·미확인 범위를 PR에 기록한다. 사용을 마친 하네스는 가능하면 같은 구현 PR에서 `--skip-specs`로 보관하되 PR 완료 gate로 만들지 않는다.

## Verification Evidence

- Result: pending. 현재 Spec 세션에서는 제품 코드와 테스트를 실행하지 않았다.
- Service: `packages/core/services/profile-pin.test.ts`. A/B/C 순서 변경·재조회, 동일 순서 재요청, pin/unpin 이후 상대 순서, 숨겨진 관계 보존, 잘못된 입력·transaction 실패, 동시 변경에서 고정 추가·해제가 생기지 않음, 변경된 commit만 effect 시작, effect 실패 후 저장 유지.
- Binary ordering: 실제 PostgreSQL의 byte 정렬과 `Buffer`/`Uint8Array` round-trip, 반복된 좁은 gap·동일 gap 충돌·길이 증가·초기화 재실행을 검증한다. Local·Remote 기존 순서와 membership, null key 혼재·구버전 호환·rollback도 확인한다. 이번에는 source·타입만 조사했으며 패키지 설치나 DB 실험은 하지 않았다.
- API: `apps/api/tests/integration/graphql/profile.test.ts`. 실제 GraphQL의 Owner·Member 성공, guest·다른 Profile·잘못된 Node ID·Remote·unavailable 거부, visible 전체 목록과 이후 조회, chronology cursor·page 결과 보존.
- Federation: `packages/fedify/src/local-post-note.test.ts`와 기존 Remote Featured 테스트. 재정렬 뒤 Public·Unlisted·Followers Only 권한별 순서, 50개 초과 여러 페이지의 누락·중복·cursor 처리와 count, Remote 수신 순서의 binary 저장·재조회, snapshot 교체·빈 목록·Featured URI 제거·교체 실패 rollback을 검증한다.
- App: 기존 Profile pin·list 테스트와 Storybook에 실제 메뉴 선택→mutation 응답→목록 순서 변화를 연결한다. 첫·마지막·단일 pin, 지연 응답·중복 입력·실패·재시도, 실제 focus, actor 전환 후 Store 격리와 chronology 보존을 확인한다.
- Static/CI: pnpm 기반의 API schema 검증, Relay compiler, 대상 TypeScript·lint·format과 해당 GitHub CI를 실행한다. 검사 이름은 다음 세션에서 최신 scripts·CI 설정과 다시 대조한다.
- Runtime: Web pointer·keyboard·Light/Dark·지원 폭을 관찰한다. Native touch·VoiceOver·TalkBack은 실제로 확인한 경우에만 통과로 기록하며 기존 Native release gate를 유지한다.
- Limits: Spec 문서 검증은 제품 동작·CI·runtime 완료의 증거가 아니다.

## Progress

- Status: Implement in progress; behavioral verification pending GitHub CI.
- Completed: 기존 Spec·canonical 변경을 현재 구현 worktree로 가져왔다. Local·Remote 공통 nullable binary key와 legacy fallback, 순서 변경 서비스·GraphQL·Featured cursor·Remote snapshot 전환을 구현했다. 앱은 pinned segment의 메뉴 이동, 목록 공통 pending, 성공 응답 정규화와 오류 재시도를 연결했다.
- Verification: 앱 Relay compiler·TypeScript·대상 ESLint·Prettier 통과. 실제 DB·서비스·API·Relay·Storybook 행동 테스트 코드는 추가했으며 실행 결과는 GitHub CI에 인계한다. 테스트 실행 전이므로 위 checkbox를 검증 완료로 처리하지 않는다.
- Review: 앱 독립 정적 검토에서 발견한 기존 TimelineRefresh GraphQL mock의 mutation 처리 누락을 수정했다. 최종 전체 변경 검토와 전달은 진행 중이다.
- Compatibility: legacy position을 제거하지 않는다. null key는 기존 Local id ASC·Remote position ASC/id ASC와 같은 유효 binary key를 조회 시 계산한다. 전역 backfill 없이 mixed 상태를 지원하며 구버전 Remote writer와의 호환을 유지한다. 구버전으로 rollback하면 수동 정렬을 표시하지 못한다는 기존 제한을 유지한다.
- Runtime limits: Web 실제 브라우저·Native 실기기·VoiceOver·TalkBack·운영 migration·배포는 수행하지 않았다.
- Next: 최종 검토·정적 검증·한국어 checkpoint·공식 Stack push/submit으로 Draft PR 전달, 최신 head의 CI를 Test에 인계한다.
- Last updated: 2026-10-27
