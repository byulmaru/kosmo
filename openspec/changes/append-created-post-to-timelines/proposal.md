## Why

Post 작성이 성공해도 이미 열어 본 Home·Profile Post List의 Relay connection에는 새 Post가 반영되지 않아, 사용자가 새로고침하거나 화면을 다시 열기 전까지 방금 작성한 결과를 확인하기 어렵다. 서버가 기존 Post List Policy로 판정한 생성 결과를 현재 selected Profile의 actor Store에 즉시 반영해 작성 성공과 목록 표시를 일치시킨다.

## What Changes

- `createPost` 성공 payload가 canonical Post identity와 cursor를 재사용하는 Home·Profile용 server-derived connection edge를 제공한다.
- Home과 Profile Post List를 안정적인 Relay managed connection으로 식별하고, 작성 요청을 시작한 actor Store의 이미 로드된 대상 connection에 새 edge를 최신순으로 한 번만 추가한다.
- Home에는 서버가 Home 후보로 판정한 Original·Quote·Reply를, 작성자 Profile에는 Reply Parent가 없고 서버가 Profile 후보로 판정한 Post만 반영한다.
- 실패, 재시도, 중복 completion, route unmount와 selected Profile·Relay Environment 전환에서 새 actor UI나 비대상 connection을 변경하지 않는다.
- Home·Profile 목록, Composer와 actor Store 격리 회귀 테스트를 추가하고, Subscription만이 새 Post membership을 소유한다고 기록한 frontend memory를 현재 Linear 경계에 맞춘다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`
- Linear Contract: [PROD-641](https://linear.app/byulmaru/issue/PROD-641)
- Linear Implementations: [PROD-641](https://linear.app/byulmaru/issue/PROD-641) — 같은 작은 변경 이슈가 구현·회귀 테스트·통합 검증·archive를 함께 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: `createPost`가 서버 판정 connection edge를 반환하고, 유니버설 클라이언트가 요청 actor의 Home·Profile managed connection에 정렬·중복·actor 격리를 보존하며 즉시 반영하도록 작성 성공 계약을 변경한다.

## Impact

- GraphQL: `CreatePostPayload`의 additive edge projection과 API schema/resolver 검증
- Universal client: `PostComposer` mutation, Home/Profile `PostList` connection identity, actor Environment 경계와 관련 Relay 테스트
- Contract: `openspec/specs/post/spec.md`의 생성 payload·목록·작성 성공 요구사항 delta
- Project memory: `memory/frontend-react-native.md`의 createPost 로컬 즉시 반영과 Subscription 소유권 경계
- 제외: DB schema/migration, 새 dependency, GraphQL Subscription·server push, 타임라인 후보·정렬 정책 변경, 광범위한 refetch
