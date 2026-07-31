## Why

Kosmo의 Post domain과 GraphQL `deletePost` mutation은 Author가 Active Post를 Tombstone으로 전환하는 삭제를 이미 지원하지만, 일반 Post·Reply·Quote의 작성자는 Home·Profile 목록과 Post 상세에서 이 행동을 실행할 수 없다. PROD-598은 기존 서버 계약을 재사용하면서 Action Bar의 More 메뉴에 작성자 삭제 흐름을 연결해, 이미 지원되는 삭제를 실제 사용자 surface에서 완결한다.

## What Changes

- 기존 Core Post 삭제 service를 재사용하는 GraphQL `deletePost` resolver가 선택된 Profile과 입력 Post를 정확히 전달하고 삭제된 Post의 global `postId`를 반환하는 경계를 검증한다.
- Action Bar의 `MoreHorizontal` 케밥 icon을 기존 `ActionMenu` trigger로 사용하고, selected Profile이 Author인 Active contentful Post에만 `삭제` 항목을 제공한다.
- 삭제 항목 선택 뒤 별도 확인 dialog를 열고 사용자가 확인한 경우에만 mutation을 한 번 실행하며, pending 중 중복 입력과 dismiss를 막는다.
- 서버 성공 뒤 현재 Relay actor Store의 Home·Profile 목록과 상세를 삭제 결과에 맞게 갱신하고, 실패·취소에는 서버 확정 cache를 유지하며 접근 가능한 한국어 오류 안내와 재시도를 제공한다.
- 일반 Post·Reply·Quote·Reply이면서 Quote, 순수 Repost Source target, guest·다른 Profile, Web·Android·iOS 흐름과 Repost 취소 회귀를 component·integration test로 검증한다.
- 기존 `add-post-action-bar` change의 링크 복사·전체 통합 생명주기와 독립적으로 PROD-598이 이 change의 구현, 통합 검증과 archive를 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-598`
- Linear Implementations: `PROD-598`

## Capabilities

### New Capabilities

- `author-post-deletion`: 기존 Post 삭제 mutation을 Action Bar의 작성자 전용 More 메뉴, 확인, Relay cache 동기화와 실패 복구에 연결하는 사용자 삭제 흐름

### Modified Capabilities

없음.

## Impact

- `apps/api/src/graphql/resolvers/post/mutation/delete.ts`와 관련 GraphQL integration test의 기존 resolver 경계를 재검증한다. Core service, DB schema와 GraphQL schema shape는 변경하지 않는다.
- `apps/app/src/components/post`의 Action Bar·목록·상세 surface, 공용 `ActionMenu`와 toast/확인 UI, Relay mutation updater 및 component/Storybook test가 영향을 받는다.
- Home·Profile Post connection과 Post 상세의 현재 actor Store cache가 서버 성공 뒤 갱신되며, selected Profile별 Store 격리는 유지된다.
- 새 외부 dependency, DB migration, physical delete, 복구, 원격 Post 사용자 삭제와 ActivityPub delivery 재설계는 없다.
