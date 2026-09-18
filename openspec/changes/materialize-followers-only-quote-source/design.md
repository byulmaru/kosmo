## Context

PROD-793은 기존 Quote resolution에 미저장 Followers Only Source 조회를 추가한다. canonical 근거는 `docs/domain/objects/post.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/profile.md`이며, 최신 PROD-793·792·509·360 계약을 독립적으로 대조했다.

2026-09-08 사용자는 인증된 선행 처리에서 검증한 Source URI↔작성자 정보가 있는 경우만 처리하도록 확정했다. 이 결정은 canonical Post 문서와 PROD-793·792에 먼저 반영했다. URI만으로 작성자를 탐색하는 방식은 이번 설계에 포함하지 않는다.

2026-09-18에 확인한 `origin/main`과 이 동기화 worktree의 기준 HEAD는 `c1de28da0d2ce01a36ae4b72e670d6993b9fc0c8`다. 선행 이슈와 PROD-792 복구 worktree는 main에 전달된 상태와 구분해 대조했다. 아래 기존 경로 표는 최신 main에서 확인한 경계다.

현재 PROD-465는 Done이며 [PR #820](https://github.com/byulmaru/kosmo/pull/820)은 2026-09-10에 main으로 병합됐다. PROD-509도 Done이며 [PR #826](https://github.com/byulmaru/kosmo/pull/826)은 2026-09-10 당시 main 기반 In Review였고 2026-09-11에 main으로 병합됐다. PROD-792는 Spec 승인 후에도 Todo이고 main 반영·commit·push·PR이 없다. 2026-09-17 복구 worktree에는 Quote resolution 구현과 행동·정적 검증 결과가 있으나 delivery gate를 통과하지 않았다. 개발 검증용 Fedify `2.4.0-dev.1922` exact pin은 production/stable 채택 승인이 아니며, stable publish 뒤 package closure·API/vocabulary diff·전체 재검증이 남아 있다. clean frozen install은 `temporal-polyfill@1.0.5`와 `temporal-utils@1.0.3`의 7일 minimum-release-age 미충족으로 차단된 상태다. 이 문단은 main에 병합된 상태와 아직 전달되지 않은 복구 작업을 구분한다.

## Goals / Non-Goals

**Goals:**

- 검증된 Source 작성자를 기준으로 조회 자격을 가진 Local Follower를 선택하고 그 identity로 인증 요청을 보낸다.
- 조회 후 identity·audience·같은 Follower 권한을 다시 확인하고 검증된 Source만 저장한다.
- 기존 Quote revision, 승인 상태, viewer visibility와 저장 원자성·멱등성을 유지한다.
- 실제 production 입력부터 기존 카드의 접근 결과까지 PROD-793 담당자가 통합 검증할 수 있게 한다.

**Non-Goals:**

- URI만으로 Source 작성자를 발견하거나 신뢰하지 않은 hint를 승인된 작성자 정보로 바꾸는 기능.
- PROD-509·792 선행 구현을 이 change에서 다시 만드는 작업.
- 일반 signed-fetch API, 일반 hydration wrapper, 원격 private Post backfill, 새 GraphQL 타입·화면.
- 로컬 Quote 작성·발신, Quote 승인·철회 정책의 재정의, 일반 Note Update/Delete와 재귀 Quote 처리.

## Implementation Guidance

다음은 구현을 시작할 때 참고할 비규범적 지침이다. 요구사항과 검증된 Active decision을 만족한다면 동등한 구현을 선택할 수 있다.

### Current Constraints

| 기존 경계                                                                                         | 확인한 동작과 이번 연결의 제약                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/fedify/src/inbound-create.ts`                                                           | 저장된 delivery Actor를 찾고 `Create.getObject({ documentLoader: context.documentLoader })`를 호출한다. delivery Actor는 Quote Source 작성자의 증거가 아니다.        |
| `packages/fedify/src/inbound-create-note.ts`                                                      | Note ID·attribution·audience를 검증하고 현재 수신 Follower를 확인한 뒤 본문·미디어를 저장한다. Source별 signer 선택 경로는 없다.                                     |
| `packages/fedify/src/remote-actor-materialization.ts`                                             | main은 optional `documentLoader`를 exact Actor lookup에 전달할 수 있다. 이 경로에서는 미저장 Source 작성자를 새로 materialize하지 않는다.                            |
| `packages/fedify/src/federation.ts`, `packages/fedify/src/local-actor-store.ts`                   | Local Profile UUID에 연결된 Actor와 key dispatcher가 있다. 현재 inbox recipient나 공용 identity를 Source signer로 자동 선택하지 않는다.                              |
| `packages/core/services/post.ts`, `packages/core/db/tables.ts`                                    | 기존 Post 저장과 `ActivityPubPosts.uri` uniqueness를 사용한다. 새 저장 엔진이나 Quote Source 전용 Post 모델을 만들 이유가 없다.                                      |
| `packages/core/visibility/post.ts`, `apps/api/src/graphql/resolvers/post/access/repost-source.ts` | 현재 viewer의 Source 조회 정책과 기존 Source resolver를 사용한다. 성공한 fetch는 viewer access 근거가 아니다.                                                        |
| `apps/worker/src/activities.ts`, `apps/worker/src/workflows`                                      | 최신 main에는 Quote resolution Workflow가 없다. PROD-792 복구본의 Workflow 입력은 `postId + revision`이므로 trusted author 공급은 별도 production 연결에서 확인한다. |

인증된 Source URI↔작성자 대응을 제공하는 main의 production 경로는 여전히 확인되지 않았다. PROD-792 복구본도 Workflow에는 `postId + revision`만 전달하며 Public/Unlisted Source를 직접 hydration한다. 임의의 테스트 입력에 expected author ID를 넣는 것만으로는 이 통합을 완성할 수 없다. PROD-793 구현에서는 PROD-792의 현재 target/revision과 대응하는 검증 결과가 실제 production 경계에서 Source URI·expected author identity로 전달되는지 코드와 동작으로 확인해야 한다.

### Recommended Approach

1. 병합된 PROD-509 경계와 PROD-792의 전달 가능한 최종 구현 및 resource budget을 다시 확인한다. Quote resolution이 전달한 현재 Post·target·revision 및 검증된 expected author 정보를 사용한다. 복구본의 `postId + revision` 입력만으로 trusted author가 공급된다고 간주하지 않으며, 전달 필드 이름은 최종 production 계약에 맞춘다.
2. 저장된 expected author와 exact Source 대응을 확인하고, 현재 established Follow 및 Active local Profile·Instance 정책으로 후보를 조회한다. 기본안은 immutable Profile ID 오름차순의 첫 후보다. DB 반환 순서나 handle 변경에 선택 결과가 의존하지 않게 한다.
3. 기존 Context 구성과 key dispatcher에서 선택한 Profile UUID의 canonical signing key를 확인하고, 그 identity로 만든 authenticated loader를 Source vocabulary hydration에 직접 전달한다. main의 `b9639a0ff`는 `context.getDocumentLoader({ identifier })` 결과를 actor lookup에 전달하는 production 패턴을 제공하지만, Source 조회의 signer 자격·key 부재 무요청 종료를 대신 증명하지 않는다. 현재 main의 Fedify 2.3에서 identifier overload는 RSA key가 없으면 일반 `documentLoader`로 fallback할 수 있으므로 반환 성공만으로 인증을 보장할 수 없다. 기본안은 `getActorKeyPairs(selectedProfileId)`로 선택 identity의 유효한 key를 확인한 뒤 `getDocumentLoader({ keyId, privateKey })` overload를 사용하는 것이다. key가 없으면 Source 요청 전에 종료한다. custom authenticated factory는 필수가 아니며 Fedify 기본 factory를 재사용한다. PROD-792가 검증 중인 Fedify 2.4 개발 snapshot이나 이후 stable을 사용하더라도 package closure·API/vocabulary compatibility와 실제 선택 identity의 서명 검증을 먼저 끝낸다. [Fedify Context 문서](https://fedify.dev/manual/context)는 key·loader 연결 API를 설명한다. [공식 authenticated loader 안내](https://fedify.dev/manual/context-advanced)는 인증 응답을 기본적으로 캐시하지 않는다고 명시하므로 별도 공용 응답 캐시를 추가하지 않는다.
4. 네트워크는 DB transaction 밖에서 수행한다. 동일 시도의 선택 Profile을 유지한 채 typed Note, exact target ID, 단일 author, canonical audience를 검사한다. `to` Public → Public, `cc` Public → Unlisted, 둘 다 없고 canonical followers marker가 있으면 Followers Only라는 기존 우선순위를 사용한다.
5. 저장 경계에서 현재 Quote target/revision과 같은 Profile·Follow 및 기존 eligibility를 다시 읽는다. 그 뒤 추가 네트워크 호출 없이 검증한 canonical 입력을 공용 저장 경계에 전달하고 현재 revision에 Source를 연결한다. 재검증·저장·연결의 정확한 transaction 참여 방식은 PROD-509·792의 실제 API에 맞춰 원자성과 stale 보호를 만족시킨다.
6. private admission은 이 Source별 경로에 한정한다. 일반 materializer에 공개 `allowPrivate` flag나 임의 callback을 추가해 검증을 호출자에게 맡기지 않는다. PROD-509의 일반 신규 조회 범위와 기존 Create의 Followers Only 동작을 각각 보존한다.
7. 현재 Quote Workflow의 transient retry와 stale no-op을 사용한다. 한 시도의 응답을 다른 Profile 권한으로 저장하지 않는다. 새 retry 시도에서도 현재 자격과 같은 후보 집합의 결정성을 확인한다. Activity input에는 필요한 identity만 전달하고 private 본문을 Workflow metadata나 로그에 복제하지 않는 쪽으로 구성한다.
8. Source 연결 후에도 PROD-792의 승인 상태와 현재 viewer의 기존 visibility를 함께 적용한다. 기존 GraphQL 결과와 Quote presentation으로 검증하며 별도 카드·fallback 화면은 추가하지 않는다.

### Allowed Alternatives

- deterministic 선택은 immutable한 동일 후보 집합에서 같은 identity를 고르는 다른 total order로 구현할 수 있다. Profile ID 정렬 자체가 제품 계약은 아니다.
- Fedify의 기존 dereferencing accessor 또는 `Context.lookupObject`를 사용할 수 있다. 선택한 authenticated loader 전달과 typed Note·exact identity 검증을 보존한다.
- identifier overload도 실제 선택 identity의 서명 사용과 key 부재 시 무요청 종료를 보장한다면 사용할 수 있다. 단순 loader 호출 성공이나 mock 호출 횟수만으로 이 조건을 증명하지 않는다.
- 선행 materializer가 제공하는 transaction 참여 경계나 domain 전용 저장 연결 중 실제 구조에 맞는 방식을 사용할 수 있다. caller가 검증을 우회할 수 없고 실패 시 partial state가 남지 않는 것이 기준이다.

### Known Traps

- Quote 작성자 또는 같은 host의 저장된 Actor를 Source 작성자로 추정하면 Source별 signer 선택의 근거가 사라진다.
- public/shared inbox의 기본 loader를 그대로 쓰거나 signer가 실패할 때 공용 identity로 바꾸면 Source별 인증 계약을 어긴다.
- Fedify 2.3 identifier overload의 key 부재 fallback을 놓치면 Source를 unsigned loader로 조회할 수 있다. custom factory 미설정 자체는 문제가 아니며, 실제 key와 서명된 요청을 확인해야 한다.
- Follow row만 확인하면 비활성 Local Profile·Instance가 남아 있는 후보를 사용할 수 있다. 반대로 Account membership을 새 제품 자격으로 추가할 근거도 없다.
- `/followers` suffix나 foreign collection dereference로 audience를 추측하지 않는다. canonical marker가 있으면 추가 유효 addressee 때문에 정상 Note를 거부하지 않는다.
- fetch 전에 확인한 Follow만 믿거나 응답 수신 직후 Source/Media를 먼저 저장하면 조회 중 권한 변경을 반영할 수 없다.
- Source를 저장했다는 이유로 Quote를 승인하거나 오래된 revision의 결과를 현재 Quote에 연결하지 않는다.
- visibility를 UI에서만 검사하면 GraphQL을 통해 Source에 접근할 수 있다. 조회 resolver 결과부터 확인한다.
- 테스트가 직접 Source 작성자 ID를 주입하는 데서 끝나면 production 입력 공급의 공백을 감춘다.

## Risks / Trade-offs

- [선행 Quote 전달 미완료] → PROD-465·509는 main 병합과 Done을 확인했다. PROD-792 복구본은 존재하지만 main·PR에 없고 dependency delivery gate도 통과하지 않았다. 전달 가능한 최종 구현과 Fedify stable compatibility 증거를 확인한 뒤 연결한다. 이 change의 작업으로 선행 구현을 대체하지 않는다.
- [검증된 작성자 입력을 제공하는 경로 부재] → PROD-793의 production 연동 완료 조건으로 추적한다. 경로가 없으면 URI만 있는 Source는 계속 건너뛰고, 별도 upstream 결정을 얻기 전 탐색 기능을 추가하지 않는다.
- [URI-only Quote의 호환 범위 제한] → 이번에 확정한 제외 범위다. 조회 가능한 outer Quote 본문은 유지한다.
- [fetch와 저장 사이 자격 변경] → 같은 identity를 저장 직전에 재검증하고 변경을 주입하는 행동 테스트를 수행한다. 네트워크를 감싼 장기 DB lock을 기본안으로 두지 않는다.
- [private materializer 범위 확대] → 일반 신규 조회의 private 거부와 기존 inbound Create 동작을 함께 회귀 검증한다.
- [Workflow history 호환성] → 기존 Workflow·Activity identity와 retry 의미를 보존하고, 선행 PROD-792의 배포·진행 중 revision 정책에 맞춰 rollout한다.

## Migration Plan

1. Spec 승인 후 구현 전에 최신 canonical·Linear, 병합된 PROD-509와 PROD-792의 전달 가능한 최종 구현을 다시 확인한다. 검증된 Source 작성자 정보를 제공하는 production 입력 경로와 transaction 연결 지점을 확정한다.
2. 신규 영속 모델이나 데이터 migration은 현재 요구하지 않는다. PROD-792의 Quote metadata와 기존 Source Post mapping을 재사용한다. 선행 구현을 확인한 결과 새로운 durable state가 필요하면 해당 근거를 검토하고 설계를 갱신한다.
3. 구현에서는 Source별 인증 조회와 existing resolution 연결을 함께 검증한 revision을 배포한다. 기존 Public/Unlisted 조회와 저장된 Followers Only Source 연결을 회귀 확인한다.
4. rollback은 이번 미저장 Followers Only 조회 진입을 비활성화하거나 코드 변경을 되돌리는 방향으로 수행한다. 이미 저장된 정상 Source나 Quote metadata를 삭제하지 않고 기존 viewer 정책을 유지한다. 진행 중 Workflow와 Activity 호환성은 PROD-792의 실제 배포 계약을 따른다.
5. PROD-793 담당자는 전체 task와 integration evidence가 충족된 뒤 delta spec을 동기화하고 change를 archive한다. 개별 PR Ready/merge는 전체 change 완료와 별도로 판단한다.

## Open Questions

- 미결정 제품 범위는 없다. URI-only 작성자 탐색은 제외하기로 확정했다.
- 구현 전 확인할 사실은 남아 있다: PROD-792의 검증된 작성자 정보 공급 지점과 전달된 최종 revision·retry 계약, 병합된 PROD-509 저장 helper의 private 경로 재사용·transaction 연결 방식, Fedify stable dependency의 package closure·채택·전체 compatibility validation, 기존 resource budget 및 Workflow의 배포 호환성이다. 로컬 복구본이나 확인되지 않은 production 경로를 완성된 것으로 간주하지 않는다.
- upstream 범위·권한·새 영속 상태를 바꿀 선택이 필요해지면 그 결정을 canonical·Linear에 먼저 반영하고 사람의 결정을 받아야 한다. 현재 권장 구현 수단만 바꾸는 경우에는 요구사항·Guardrails·검증 결과를 보존한다.

## 2026-09-09 재사용 경계 정렬

PROD-509는 검증된 PUBLIC/UNLISTED Reply도 최초 저장하며 필요한 audience·`inReplyTo` 해석·Parent DB lookup/fallback의 최소 로직을 소유한다. 전체 Note projector나 두 단계 projection API를 요구하지 않는다. 기존 content/media helper와 `createPost`를 재사용한다.

이 private 경로는 기존 Source-author 근거, Local Follower 선택, signed fetch와 저장 직전 동일 identity·권한 재검증을 그대로 수행한다. Source가 Reply여도 Source 자신의 identity·author·audience를 사용하며 Parent 또는 Parent 작성자로 대체하지 않는다. PUBLIC/UNLISTED 경로의 허용 범위를 넓혀 이 검증을 우회하지 않는다.

## 2026-09-18 선행 구현과 승인된 저장 경계 동기화

- main에 병합된 PROD-509의 `packages/fedify/src/inbound-create-note.ts`는 필수 `observation` 입력을 포함한 `materializeHydratedRemoteNote({ context, note, objectUri, observation, receivedAt })`를 export하고 `created | duplicate | rejected` 결과를 반환한다. `resolveNoteVisibility(note)`를 followers URI 없이 호출하므로 현재 공개 진입점에서는 Public/Unlisted만 허용한다. 이 함수를 그대로 호출해 private Source가 저장될 것으로 가정하거나 공개 API를 private admission 우회 수단으로 확장하지 않는다.
- 같은 파일의 `createRemoteNotePost`, `resolveReplyParentId`, `projectRemoteNote`는 내부 helper다. 실제 필요한 최소 재사용 경계만 연결하고, 기존 public 진입점에 `allowPrivate`를 추가하거나 private 검증을 호출자 callback에 위임하지 않는다. `createPost`는 현재 자체 transaction을 소유하므로 Quote revision의 재검증·연결까지 외부 transaction에 참여한다고 가정하지 않는다. 이 연결의 원자성은 PROD-792 구현을 확인한 뒤 해결한다.
- PROD-509의 Media 선택·검증은 기존 `projectRemoteNoteMedia` 계약을 재사용한다. 지원되는 embedded 이미지 중 앞 4개를 처리하고 IRI-only·비지원·초과 attachment는 추가 fetch하지 않는다. 선택된 후보가 잘못되면 Note 전체를 거부한다. 같은 URL의 attachment별 Media identity와 nullable metadata도 보존한다. 신규 Public/Unlisted 경로의 empty Note 거부를 근거 없이 기존 Create나 이 private 경로에 일괄 확대하지 않는다.
- PROD-509에서는 Note 검증과 Actor exact URI 검증을 Actor persistence 전에 끝내고, Actor/Profile 및 Instance와 Post의 독립 저장 경계를 유지한다. 유효하게 commit된 작성자·Instance를 후속 Post 실패·duplicate 때문에 보상 삭제하지 않는다. 이 private 경로는 이미 저장된 expected author만 사용하므로 작성자 신규 materialization을 시작하지 않는다. Source Post·Content·mapping·Media·최초 Parent 관계의 rollback 보장은 그대로 유지한다.
- PROD-465의 원격 Note 10,000자 한계는 원문에도 적용하며 Local Quote 작성분과 합산하지 않는다. hydration 응답 바이트·파싱 비용의 추가 보호는 PROD-931의 별도 범위이며, 10,000자 검증이 이를 보장한다고 설명하지 않는다.
- 최신 main의 Post Eligibility는 Profile Block 방향을 구분한다. viewer가 Block Owner이고 역방향 Block이 없으면 다른 조회 조건에 따라 Source를 볼 수 있고, Block Target 또는 양방향 Block이면 볼 수 없다. Quote 승인과 Followers Only 자격은 별도로 필요하다. 기존 Quote preview 깊이와 순수 Repost 표시 및 Quote Notification 소유권을 변경하지 않는다.
- main의 `b9639a0ff`는 Local Profile이 주어진 remote actor refresh에서 해당 Profile의 document loader를 actor lookup에 전달한다. PROD-793은 이 제한된 production 패턴을 참고할 수 있지만, 미저장 Source author materialization이나 generic signed fetch로 확대하지 않고 Source Note의 별도 신뢰·권한 검증을 유지한다.
- PROD-509의 Media·작성자/Post 저장 미결정과 최종 Spec 승인 대기는 2026-09-09 해당 이슈의 사용자 결정과 최종 승인으로 해소됐고, PR #826은 2026-09-11 main에 병합됐다. PROD-792는 Spec 승인과 로컬 복구 구현·행동 검증이 있으나 main/PR delivery, clean frozen install, Fedify stable adoption·전체 재검증이 남아 있다. 이 선행 상태 기록은 PROD-793 구현 착수 승인이 아니다. PROD-661과 PROD-506을 새 blocker로 추가하지 않는다.
