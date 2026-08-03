## Why

`createPost`가 성공해도 이미 열어 둔 Home·작성자 Profile Post List의 Relay connection에는 새 Post가 반영되지 않아 사용자가 새로고침 전까지 결과를 확인하기 어렵다. 호출자 Store에서 normalized Post를 즉시 반영해 작성 성공과 현재 목록을 일치시킨다.

## What Changes

- `createPost`의 기존 `CreatePostPayload.post` 선택을 유지하고 별도 edge 공개 계약은 추가하지 않는다.
- Home과 Profile Post List를 surface별 안정적인 Relay managed connection으로 식별한다.
- mutation updater가 normalized `post`를 요청 actor Environment의 이미 로드된 Home connection에 최신순으로 한 번 반영한다. Reply Parent가 없을 때만 작성자 Profile connection에도 반영한다.
- updater는 connection을 합성하거나 Post List 정책·cursor를 재구현하지 않고, 같은 Post Node의 edge를 중복 삽입하지 않는다.
- 기존 mounted/context/Environment 수명주기 보호를 유지해 늦은 결과가 새 actor Store나 unmounted UI를 변경하지 않게 한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`
- Linear Contract: [PROD-641](https://linear.app/byulmaru/issue/PROD-641)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: `createPost` 성공 후 호출자 Relay Store의 로컬 connection membership을 동기화한다.

## Impact

- Universal client: `PostComposer` mutation, Home/Profile `@connection` identity, 좁은 Relay updater와 관련 테스트
- OpenSpec delta: API schema 또는 server projection이 아닌 caller-local Store update만 기록
- 제외: `CreatePostPayload` edge field, server-side edge projection, GraphQL Subscription/server push, 다른 actor Store 동기화, 광범위한 refetch, DB schema/migration
