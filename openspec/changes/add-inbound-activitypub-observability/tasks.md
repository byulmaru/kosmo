## 1. PROD-634 관측 계약과 공통 helper

**Authority / Provenance**

- `docs/operations/sentry.md`
- `PROD-634`
- `PROD-477`, `PROD-484`

**Deliverable**

모든 production inbound handler가 bounded activity/phase/outcome/reason 분류와 구조화 logger/reporter를 통해 처리된 실패를 관측할 수 있다.

**Guardrails**

- 외부 원인 실패와 정상 거절/no-op은 Sentry에 보내지 않는다.
- 내부 unexpected·내부 effect 실패만 runtime Sentry callback에 전달한다.
- raw Activity/signature/key/credential/불필요한 개인정보와 URI 기반 tag/fingerprint를 금지한다.
- 앱 rate limiter/sampler를 추가하지 않는다.

**Verification**

- helper 단위 테스트로 분류, bounded metadata, logger/reporter 호출과 반복 호출 정책을 검증한다.
- `pnpm exec openspec validate add-inbound-activitypub-observability --strict`를 통과시킨다.

- [x] 1.1 처리된 실패와 no-op을 위한 공통 inbound 관측 분류·logger·runtime reporter seam을 구현한다.
- [x] 1.2 외부/내부 분류, 안정적인 grouping metadata와 민감정보 차단 helper 단위 테스트를 추가한다.

## 2. PROD-634 production inbound handler inventory 연결

**Authority / Provenance**

- `PROD-634`
- 관련 ActivityPub canonical specs: `openspec/specs/activitypub-actor-discovery/spec.md`, `openspec/specs/activitypub-inbound-reaction/spec.md`, `openspec/specs/activitypub-remote-post-ingestion/spec.md`, `openspec/specs/activitypub-remote-repost/spec.md`

**Deliverable**

Accept, Announce, Create, Delete, Follow, Like/EmojiReact, Reject, Undo, Update와 공유 object/actor/projection/delivery 경계가 inventory에 반영되고 공통 관측 helper를 사용한다.

**Guardrails**

- 기존 activity 검증·저장·멱등·실패 격리와 응답/처리 결과를 바꾸지 않는다.
- remote lookup/materialization/protocol/delivery 실패는 로그 전용이다.
- 내부 DB projection/post-commit effect unexpected 오류는 재throw 또는 기존 격리를 유지하며 Sentry callback을 사용한다.
- handler별 ad-hoc `console.error`와 silent swallow를 남기지 않는다.

**Verification**

- 대표 Accept object lookup, Create/Update remote materialization, Announce projection, Follow delivery, Delete/Undo/Reaction 경계 회귀 테스트를 실행한다.
- inventory가 모든 `suppressError`, 처리된 `catch`, post-commit catch 지점을 나열하고 각 reason code를 연결하는지 검토한다.

- [x] 2.1 production inbound handler의 처리된 catch/suppress/no-op 지점을 공통 helper와 안정적 reason code로 연결한다.
- [x] 2.2 기존 ad-hoc 오류 로그를 공통 구조화 로그로 교체하고 activity 결과/보안/멱등 회귀를 보존한다.

## 3. PROD-634 listener 및 runtime 경계 검증

**Authority / Provenance**

- `docs/operations/sentry.md`
- `PROD-634`
- `PROD-477`, `PROD-484`

**Deliverable**

production personal/shared inbox listener가 대표 외부 실패를 로그 전용으로, 대표 내부 오류를 단일 Sentry capture로 전달하며 기존 listener 응답을 유지한다.

**Guardrails**

- Fedify package에 Sentry SDK dependency/초기화 정책을 추가하지 않는다.
- 반복 실패는 SDK/ingest quota에 위임한다.
- listener wrapper는 오류 소비나 중복 capture로 기존 Fedify 동작을 바꾸지 않는다.

**Verification**

- production federation listener 통합 테스트에서 personal/shared inbox 경계를 통과시키고 외부/내부 capture 횟수와 metadata를 검증한다.
- `@kosmo/fedify` typecheck/unit tests와 영향을 받는 `@kosmo/web`/`@kosmo/api` check를 실행한다.

- [x] 3.1 federation listener와 Web BFF 기존 Sentry callback을 좁은 seam으로 연결한다.
- [x] 3.2 대표 listener integration 및 package/runtime focused tests와 typecheck를 통과시킨다.

## 4. PROD-634 review-fix verification

**Authority / Provenance**

- `PROD-634`
- `docs/operations/sentry.md`

**Deliverable**

리뷰에서 확인된 관측 경계·no-op 분류 회귀를 기존 계약을 바꾸지 않고 검증한다.

**Verification**

- [x] 4.1 malformed/pre-dispatch JSON과 typed listener 오류의 Sentry 경계, 명시적 remote error 분류를
      회귀 테스트로 검증한다.
- [x] 4.2 Update/Undo object lookup 조기 반환, Announce Undo 삭제 결과와 pending Follow 생성 여부의
      로그 의미를 회귀 테스트로 검증한다.
- [x] 4.3 core post-commit observer의 동기 throw/비동기 reject가 커밋된 상태와 후속 delivery를
      중단하지 않는지 회귀 테스트로 검증한다.
- [x] 4.4 duplicate Create, established Accept 재처리와 Follow Undo의 pending 삭제/true noop을
      structured log로 구분하는 회귀 테스트를 추가한다.
- [x] 4.5 Accept/Follow/Reject의 state-change 경쟁 no-op을 별도 reason code로 기록하고, Follow·Reaction
      post-commit source가 terminal race로 사라진 경우 Sentry 관측 없이 커밋 결과를 유지하는 회귀 테스트를 추가한다.
