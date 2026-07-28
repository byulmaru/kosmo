## Context

현재 `packages/core/services/post.ts`의 `repostPost`는 Source 접근·구조·visibility를 검증하고 내부 transaction에서 Active contentless Repost를 멱등 생성해 `{ created, repost }`를 반환한다. `deletePost`는 Author를 검증한 뒤 Active Post를 Tombstone으로 전이하지만 실제 전이 여부를 반환하지 않는다. GraphQL resolver는 이 결과가 반환된 뒤 Repost Notification 생성·정리를 best-effort로 수행하므로 application side effect 소유권이 API와 core로 나뉘어 있다.

`packages/fedify`에는 configured Local Instance context, local actor/key dispatcher, Follow/Undo delivery helper와 PROD-494의 Local/Remote Post ActivityPub URI resolver가 있다. Remote Follow application service는 transaction 안에서 결과를 확정한 뒤 dynamic import로 Fedify delivery를 호출하고 실패를 catch/log해 committed payload를 유지한다. 이 패턴이 PROD-447에서 검증된 현재 post-commit 경계다.

Post audience에는 followers collection URI가 이미 사용되지만 followers collection dispatcher는 공개되지 않았다. 따라서 Fedify의 `"followers"` shorthand에 의존할 수 없고, 현재 저장된 established Follow와 ActivityPub actor endpoint에서 실제 recipient를 투영해야 한다. 저장소에는 MessageQueue, transactional outbox 또는 outbound delivery history가 연결되어 있지 않다.

## Goals / Non-Goals

**Goals:**

- Local Repost identity에서 deterministic Announce와 Undo를 만든다.
- Local/Remote Source에 PROD-494 Post URI resolver를 재사용한다.
- Repost audience와 established remote follower recipient를 일관되게 적용한다.
- 최초 생성·취소 transaction commit 이후에만 delivery를 시작한다.
- delivery 실패를 committed domain/GraphQL 결과와 분리하고 관측한다.
- 기존 Repost Notification과 일반 Post 삭제 동작을 회귀시키지 않는다.

**Non-Goals:**

- inbound Announce/Undo, Reply·Reaction federation, Quote·중첩 Repost federation
- Source Author를 follower 관계와 무관한 recipient로 추가
- followers/outbox collection endpoint와 actor document 확장
- transactional outbox, NATS/Fedify MessageQueue, worker, durable retry/history
- Repost 저장·visibility·GraphQL/UI 제품 계약 변경

## Implementation Guidance

### Current Constraints

- Repost 생성의 `created` 값은 partial unique index conflict를 정규화한 뒤에만 확정된다. insert 시도 전에 delivery 여부를 결정하면 동시 요청이 중복 Announce를 시작할 수 있다.
- `deletePost`는 현재 이미 Tombstone인 반복 요청과 최초 update를 구분하지 않는다. post-transaction row 상태만 다시 읽으면 동시 취소 두 건이 모두 Undo를 시작할 수 있으므로 conditional update의 실제 반환 결과가 필요하다.
- `@kosmo/api`는 `@kosmo/fedify`에 직접 의존하지 않고, `@kosmo/core`와 `@kosmo/fedify`는 기존 remote Follow delivery 때문에 runtime cycle을 dynamic import로 끊고 있다. 새 API→Fedify dependency를 추가하기보다 검증된 core application boundary를 재사용하는 편이 현재 구조와 맞는다.
- Repost core action은 Local/Remote selected Profile 모두에 재사용될 수 있다. protocol helper가 committed Repost Author의 configured Local Instance 소속을 확인하지 않으면 remote-origin action을 Local Announce로 잘못 보낼 수 있다.
- Undo 시점에는 Repost가 Tombstone이고 Source도 이후 Tombstone일 수 있다. Active Note projection을 그대로 재사용하면 원본 Announce identity를 복구하지 못한다. Activity identity projection과 현재 object representation availability를 구분해야 한다.
- Post URI resolver는 Post lifecycle과 무관하게 저장 identity를 해석하지만 remote Post mapping이 없는 remote Source에는 URI를 만들 수 없다.
- follower audience address만으로 실제 HTTP recipient가 정해지지 않는다. established remote follower의 actor URI, inbox와 선택적 shared inbox를 DB에서 projection해야 한다.
- 현재 direct Fedify context에는 durable queue가 없으므로 send 실패가 호출자에게 전파된다. 모든 projection/query/serialization/send 오류를 commit 이후 관측 경계에서 함께 격리해야 한다.
- `repostPost`와 `deletePost`는 caller-owned transaction에도 참여할 수 있지만 현재 transaction abstraction에는 after-commit hook이 없다. 전달 호출을 nested transaction 반환 직후 실행하면 outer transaction commit 전 side effect가 되므로, direct delivery는 `tx`를 받지 않은 top-level application 호출만 소유하고 caller-owned transaction 경로에서는 실행하지 않는다.

### Recommended Approach

1. `packages/fedify`에 committed Repost ID와 activity 종류를 입력받는 Repost delivery adapter를 둔다. adapter는 DB에서 Repost, Author Profile/Instance와 direct Source를 읽고 Local Author, Repost 구조/lifecycle와 Source identity 조건을 검증한다.
2. Announce projection은 Active contentless Repost와 Content Source를 요구한다. Undo projection은 Tombstone Repost와 보존된 direct Source 관계/identity를 요구하되 Source의 현재 Content나 Active representation은 요구하지 않는다.
3. activity ID는 configured Local Instance canonical origin과 Repost UUID에서 파생하고, actor는 Fedify context의 Local actor URI, object는 공통 Post URI resolver 결과를 사용한다. Announce와 Undo에는 Repost ID 기반의 같은 ordering key를 사용한다.
4. Repost Visibility에서 followers/Public audience를 만들고, 행동 Profile을 followee로 가진 established Follow를 remote ActivityPub actor endpoint와 join해 recipient 배열을 만든다. Active Profile, non-Suspended ActivityPub Instance와 inbox를 요구하고 local follower를 제외한다. shared inbox가 있으면 Fedify의 shared inbox 우선 옵션을 사용한다.
5. `repostPost`는 기존 transaction 결과를 먼저 확정한 뒤 `created: true`인 경우에만 dynamic import로 Announce delivery를 호출한다. helper가 non-local 또는 unavailable projection을 반환하면 조용히 skip하고, 예외는 Repost ID를 포함해 catch/log한 뒤 기존 결과를 반환한다.
6. `deletePost` conditional update는 실제 전이된 row 또는 boolean을 내부 결과에 포함한다. transaction commit 뒤 실제 전이가 있었을 때만 dynamic import로 Undo delivery를 호출하고, adapter가 Repost가 아닌 구조를 skip하게 한다. GraphQL resolver는 기존 `postId`만 공개한다.
7. Notification 생성·정리도 Repost application service의 top-level post-commit 경계로 이동한다. Notification과 Fedify delivery는 각각 실패를 격리하고, API resolver는 application 결과를 GraphQL payload로 변환하는 역할만 유지한다.
8. Fedify adapter test는 activity projection과 send call을 검증하고, core/API test는 최초 상태 전이, post-commit 호출 조건과 failure isolation을 검증한다.

### Allowed Alternatives

- recipient projection을 Fedify adapter 내부 helper 또는 core의 read-only projection으로 둘 수 있다. 다만 protocol `Recipient` 형식과 ActivityPub URI 조립은 `packages/fedify`가 소유하고, application transaction 안에서 HTTP delivery를 수행하지 않아야 한다.
- Undo `object`는 정확한 Announce identity를 유지하는 한 embedded Announce 또는 IRI 표현을 사용할 수 있다. 현재 Follow Undo와의 일관성을 위해 embedded Announce를 기본으로 한다.
- transition 여부를 boolean 또는 반환 row로 표현할 수 있다. GraphQL public payload에 새 field를 추가하지 않고 동시 최초 전이를 정확히 구분해야 한다.

### Known Traps

- GraphQL resolver에서 transaction 시작 전에 delivery promise를 만들거나 core transaction callback 안에서 Fedify를 await하면 rollback된 Repost가 외부에 전달될 수 있다.
- `repostPost`의 반환 row가 존재한다는 사실만으로 Announce를 보내면 duplicate action마다 재전송한다. 반드시 `created`를 사용한다.
- Tombstone row를 읽었다는 이유만으로 Undo를 보내면 반복·동시 삭제가 중복 delivery를 시작한다. conditional update의 실제 transition 결과를 사용한다.
- mapping 부재만으로 Source를 Local로 간주하거나 request host에서 activity URI를 만들면 PROD-494 identity와 갈라진다.
- Undo에서 Active Source/Content를 요구하면 Source가 먼저 Tombstone된 Repost를 원격에서 취소할 수 없다.
- Source Author를 암묵적으로 recipient에 더하거나 local follower에게 federation delivery를 하면 승인된 recipient 범위를 넓힌다.
- `sendActivity(..., "followers", ...)`를 사용하면서 followers dispatcher를 구현하지 않거나 첫 page만 반환하면 delivery가 실패하거나 일부 follower만 받는다.
- delivery 오류를 GraphQL까지 throw하거나 Notification catch와 하나로 묶으면 committed result 또는 독립 side effect 계약을 위반한다.

## Risks / Trade-offs

- [Risk] commit 직후 process 종료 시 Announce/Undo가 유실된다. → 현재 direct-delivery 제한으로 명시하고 PROD-448의 transactional outbox migration 전에는 durable 상태를 추가하지 않는다.
- [Risk] Undo는 취소 시점의 현재 follower에게만 전달되어 과거 Announce recipient와 정확히 일치하지 않을 수 있다. → recipient history를 이번 범위에 추가하지 않고 stable activity identity로 수신 측 멱등 처리를 가능하게 한다.
- [Risk] UNRESPONSIVE Instance delivery가 다시 실패할 수 있다. → 저장 endpoint가 있는 non-Suspended recipient에는 시도하되 실패를 post-commit 관측 경계에서 격리한다.
- [Risk] recipient 수가 많으면 mutation 응답 시간이 길어진다. → 현재 scope에서는 direct delivery 제한을 수용하고 queue/fan-out migration을 PROD-448 이후 범위로 둔다.
- [Risk] `packages/core`와 `packages/fedify`의 기존 runtime cycle이 유지된다. → static import를 추가하지 않고 PROD-447과 같은 post-commit dynamic import를 사용하며 package-graph 정리는 별도 소유 범위로 둔다.

## Migration Plan

1. storage migration 없이 Fedify Repost projection과 serialization을 추가하고 local/remote Source, recipient와 unavailable matrix를 검증한다.
2. core Repost 생성·삭제의 최초 transition 판별과 post-commit delivery를 연결한다.
3. delivery 실패 주입을 포함한 core/API integration과 기존 Notification·일반 삭제 회귀를 검증한다.
4. OpenSpec strict, package typecheck/test와 workspace lint를 통과한 뒤 기존 API/Fedify process를 함께 배포한다.
5. rollback은 Repost post-commit 호출과 Fedify adapter export를 제거하는 코드 rollback으로 수행한다. DB schema와 저장 row 변환이 없어 데이터 rollback은 필요하지 않다.

## Open Questions

없음.
