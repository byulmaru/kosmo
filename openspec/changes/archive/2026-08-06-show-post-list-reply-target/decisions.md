## Context

이 기록은 PROD-696, 적용되는 canonical Post 목록·상세 thread·접근성 문서, 승인된 Repost attribution 행 재사용 설계와 `post-reply-ui` delta requirement를 반영한다.

## Decision Records

### Reply 대상 attribution은 일반 목록에만 표시한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `docs/design/accessibility.md`, `PROD-696`
- Status: Active
- Context / Problem: 일반 목록에서는 Reply 관계가 보이지 않지만 상세 thread는 connector와 행 순서로 같은 관계를 이미 전달한다. nullable Reply Parent가 조회되지 않는 경우에도 현재 Reply는 유지되어야 한다.
- Decision Outcome: 조회 가능한 Parent가 있는 일반 Reply와 Reply+Quote에 Message Circle icon과 `{displayName}님에게 답글` 비대화형 텍스트를 한 번 표시한다. Parent가 없거나 조회되지 않으면 대체 문구 없이 숨기고, 상세 thread의 조상·현재·하위 모든 행에는 표시하지 않는다.
- Alternatives Considered: 상세 thread에도 같은 attribution 표시, Parent 미조회 시 대체 문구 표시, Parent Post·Profile 링크 제공은 각각 중복 정보, visibility 경계 추론, 승인 범위 밖 navigation을 만들기 때문에 채택하지 않았다.
- Consequences: 일반 목록과 상세 thread가 같은 `PostListItem` renderer를 사용하더라도 목록 전용 metadata 표시 경계를 보존해야 한다. Web·Native는 같은 표현을 사용하되 runtime 검증 증거는 플랫폼별로 구분한다.
- Confirmation / Follow-up: 일반 Reply, Reply+Quote, Parent 미조회, 일반 Post, 순수 Repost와 상세 thread 전체 행의 관찰 가능한 결과를 검증한다.

### Repost와 Reply attribution은 layout만 공유한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `PROD-696`
- Status: Active
- Context / Problem: 두 attribution은 icon column·text slot·typography·행 간격을 공유하지만 Repost는 Profile link이고 Reply는 클릭할 수 없는 일반 텍스트다.
- Decision Outcome: 두 호출부가 공용 상단 행 layout에 icon과 content를 전달한다. 공용 layout은 관계 종류나 링크 여부를 추론하지 않으며, Repost와 Reply caller가 각자의 interaction과 접근성 의미를 소유한다.
- Alternatives Considered: `repost | reply` variant가 semantics까지 분기하는 component, 두 markup의 복제, 미래 attribution registry를 검토했으나 현재 두 경우만 존재하며 불필요한 결합·style drift·미래 일반화를 만든다.
- Consequences: 기존 Repost Link·Pressable subtree는 유지되고 Reply는 icon을 접근성 트리에서 숨긴 plain text로 남는다. 추가 attribution 종류가 생기기 전에는 variant framework나 별도 공용 package를 만들지 않는다.
- Confirmation / Follow-up: 기존 Repost attribution의 link target·문구·geometry와 Reply 문구의 비대화형 semantics를 함께 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
