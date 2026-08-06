## 1. PROD-696 일반 목록 Reply 대상 attribution

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/design/post-action-bar.md`
- `docs/design/post-thread.md`
- `docs/design/accessibility.md`
- `PROD-696`

**Deliverable**

조회 가능한 Reply Parent를 가진 일반 목록의 Reply와 Reply+Quote가 기존 Repost 상단 행과 같은 위치에 Reply 대상 안내를 한 번 표시하고, Parent 미조회·일반 Post·순수 Repost와 상세 thread 전체에서는 표시하지 않는다. PROD-696은 이 결과의 구현·검증·OpenSpec 정합성 확인과 archive를 소유한다.

**Guardrails**

- Reply 문구는 `{displayName}님에게 답글`이며 클릭 동작이나 Post·Profile navigation을 제공하지 않는다.
- Message Circle icon은 장식 요소로 보조 기술에서 숨기고 문구만 텍스트로 인식되게 한다.
- Repost와 Reply attribution은 layout만 공유하고 각 caller가 interaction과 접근성 의미를 소유한다.
- 기존 nullable Reply Parent 조회·visibility, Post List 후보, Repost·Quote presentation, 상세 thread connector·행 구성과 Reply Composer를 변경하지 않는다.
- GraphQL schema·resolver, database, migration, federation, route와 dependency를 변경하지 않는다.
- 검증하지 않은 Native runtime 결과를 Web·공용 source 검증으로 완료했다고 일반화하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/stories/fixtures.ts`의 기존 Reply Parent reference shape와 `apps/app/src/stories/Posts.stories.tsx`의 공용 `PostListItem`·상세 thread 상태 및 가장 가까운 기존 assertion.
- 테스트 필요성: 일반 Reply 표시, Parent 미조회·일반 Post 미표시, Reply+Quote 1회 표시, 상세 thread 조상·현재·하위 미표시, 기존 순수 Repost attribution·interaction 회귀를 관찰 가능한 결과로 검증한다.
- 테스트 제외 범위: 관련 없는 Story 상태·snapshot·coverage 확대, 새 fixture/helper/harness, 광범위한 E2E, 테스트 인프라 변경과 미보유 Native runtime 자동화.
- Relay compiler, App typecheck·관련 테스트, Storybook a11y, strict OpenSpec validation, formatting과 diff check를 통과한다.
- Web에서 일반 Reply·Reply+Quote·상세 thread의 문구, 배치와 비대화형 semantics를 확인하고 실행하지 못한 Native runtime 검증을 별도로 기록한다.

- [x] 1.1 승인된 목록 attribution과 상세 thread 제외 계약을 canonical design 문서에 동기화한다.
- [x] 1.2 일반 목록의 Reply 대상 attribution과 상세 thread 제외 동작을 구현한다.
- [x] 1.3 승인 동작과 기존 Repost·Quote 회귀를 직접 증명하는 최소 Storybook/컴포넌트 assertion을 추가한다.
- [x] 1.4 Relay compiler, App typecheck·관련 테스트, Storybook a11y, Web 수동 확인과 저장소 정적 검증을 수행하고 플랫폼별 검증 공백을 기록한다.
- [ ] 1.5 최신 canonical·Linear와 구현·delta spec 정합성을 대조하고 change를 archive한 뒤 strict validation을 다시 통과시킨다.
