## Context

`updateProfile`은 optional caller transaction에 참여해 Profile scalar, ProfileMedia와 Profile Tag를 원자적으로
저장하고 현재 Profile row를 반환한다. 현재 actual actor projection 변경 여부를 구분하지 않으며 commit 이후
side effect도 없다. `addReaction`/`deleteReaction`은 transaction 유무와 독립적으로 one-shot `postCommit()`
lifecycle을 반환하고 entry point가 commit 뒤 실행하는 선례를 제공한다.

PROD-628은 Local Profile, Ready Local avatar/header, follow policy와 key/endpoint를 canonical Fedify `Person`으로
만드는 경계를 완성했다. PROD-512의 dispatcher는 author followers를 active remote ActivityPub recipient로 확장하고
actor/shared inbox 중복과 empty recipient를 처리한다.

## Goals / Non-Goals

**Goals:**

- actual federation-visible Profile 변경만 post-commit lifecycle로 표현한다.
- caller-owned transaction에서도 lifecycle을 유지하고 outer commit 뒤 실행할 수 있게 한다.
- canonical Local `Person`과 공통 recipient dispatcher를 재사용해 `Update(Person)`을 전달한다.
- direct delivery 실패를 committed application 결과에서 격리하고 관측한다.

**Non-Goals:**

- Profile Tag·Link ActivityPub 표현, actor Delete/Tombstone, GraphQL schema 또는 UI 변경
- transactional outbox, durable retry/history, worker와 process 종료 유실 방지
- remote inbound Update와 Local actor projection 자체 변경

## Implementation Guidance

### Current Constraints

- `updateProfile`의 scalar input은 생략과 명시 값을 구분하지만 같은 저장값을 명시해도 현재 UPDATE를 실행한다.
- avatar/header change 판정에는 write 전 ProfileMedia의 현재 media ID가 필요하다. 관계 제거 대상이 이미 없거나
  같은 Media ID를 다시 지정한 경우는 delivery no-op이어야 한다.
- Profile Tag 변경은 같은 transaction에 포함되지만 canonical ActivityPub actor projection에는 포함되지 않는다.
- caller-owned Drizzle transaction에는 after-commit hook이 없으므로 core가 remote I/O를 transaction 안에서
  실행할 수 없다.
- outbound delivery는 commit 뒤 최신 DB projection을 다시 읽어야 하며 update transaction에서 조립한 임시
  `Person`을 전달하면 actor 역참조와 representation 경계가 갈라진다.
- 하나의 Profile은 여러 번 수정될 수 있으므로 고정된 Update activity ID를 반복 사용하면 remote deduplication이
  이후 변경을 버릴 수 있다.

### Recommended Approach

1. `updateProfile` transaction에서 현재 scalar와 avatar/header Media relation을 읽고 정규화된 요청값과 비교해
   actor projection change flag를 계산한다. 기존 validation과 원자 write 경계는 유지한다.
2. action 결과를 `{ profile, postCommit }`으로 확장한다. change flag가 없으면 no-op lifecycle을, 있으면 동일
   Promise를 재사용하는 one-shot lifecycle을 반환한다. transaction 유무로 lifecycle 생성 여부를 분기하지 않는다.
3. GraphQL resolver는 core action 결과를 받은 뒤 `postCommit()`을 await하고 기존 payload에는 `profile`만
   mapping한다. caller-owned transaction은 transaction owner가 outer commit 뒤 같은 lifecycle을 실행한다.
4. post-commit effect는 Fedify delivery helper를 동적 import해 호출하고, 실패를 Profile ID와 함께 기록한 뒤
   resolve한다.
5. delivery helper는 Active Local Profile과 canonical origin을 확인하고 Local outbound context를 만든다. PROD-628
   저장 projection과 `createLocalProfilePerson` 경계를 통해 최신 embedded `Person`을 만들고, unique Update IRI와
   followers audience를 갖는 `Update`를 구성한다.
6. `dispatchActivityPubActivity`에 direct target 없이 author Profile ID를 전달해 established remote followers만
   확장·중복 제거하고 shared inbox preference로 전송한다.

### Allowed Alternatives

- 기존 actor dispatcher와 outbound helper가 공유하는 더 높은 수준의 Local `Person` projection helper를 추출할
  수 있다. 다만 현재 production caller가 실제로 사용하고 identity/key/optional field 규칙을 우회할 수 없어야 한다.
- actor projection change 판정은 관계 조회와 scalar 조회를 한 statement로 합치거나 동일 transaction의 별도
  bounded query로 수행할 수 있다. write 전 current state와 비교하고 원자성·검증 순서를 유지해야 한다.

### Known Traps

- `tx` 존재 여부로 Update lifecycle을 생략하거나 origin을 추론하지 않는다.
- outer commit 전에 `postCommit()` 또는 Fedify remote I/O를 실행하지 않는다.
- input field 존재만으로 change를 판정하지 않고 정규화 후 저장 current value와 비교한다.
- Profile Tag 변경을 actor Update trigger로 확대하지 않는다.
- update transaction 안의 임시 object나 별도 JSON serializer로 embedded `Person`을 만들지 않는다.
- Profile Update마다 같은 activity ID를 재사용하지 않는다.
- delivery 실패를 GraphQL error로 다시 throw하거나 committed Profile을 보상 rollback하지 않는다.

## Risks / Trade-offs

- [Risk] commit 뒤 delivery 시작 전 process가 종료되면 Update가 유실된다. → PROD-448의 durable outbox 범위로
  명시하고 현재 direct-delivery slice의 선행 조건으로 만들지 않는다.
- [Risk] 연속 Profile update의 HTTP delivery 완료 순서는 보장되지 않는다. → embedded object는 delivery 시작 시
  최신 committed projection을 읽고, durable ordering은 outbox/worker 설계로 미룬다.
- [Risk] `postCommit()` 반환 contract를 caller가 실행하지 않으면 delivery가 누락된다. → production GraphQL caller를
  같은 PR에서 연결하고 caller-owned transaction test로 실행 책임을 명시한다.
- [Risk] Update projection 중 key가 처음 생성될 수 있다. → PROD-628의 기존 lazy key identity 경계를 재사용하고
  별도 key lifecycle을 만들지 않는다.

## Migration Plan

1. additive code와 test만 배포하며 DB/GraphQL schema migration은 없다.
2. 기존 Profile update 응답 shape를 유지한 채 post-commit delivery를 활성화한다.
3. rollback은 delivery lifecycle 연결을 제거하는 코드 rollback으로 수행한다. 이미 원격에 전달된 Update를
   회수하거나 보상 activity로 되돌리지는 않는다.

## Open Questions

없음.
