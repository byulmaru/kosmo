## 1. PROD-360 audience validation and inbox relevance

**Authority / Provenance**

- `docs/domain/objects/post.md#activitypub-local-note-표현`
- `docs/domain/objects/follow-relationship.md#조회-정책`
- `docs/domain/policies/post-list.md#후보-정책`
- `PROD-360`

**Deliverable**

personal/shared inbox에서 verified remote actor의 audience marker와 현재 local Follow Relationship을 검증해 유효한 Followers Only Note만 다음 materialization 단계로 넘긴다. Public/Unlisted marker가 있는 Note는 extra actor URI가 있어도 기존 visibility로 계속 처리한다.

**Guardrails**

- `to` Public → PUBLIC, `cc` Public(그리고 to에는 없음) → UNLISTED, 그 밖의 verified author canonical followers URI → FOLLOWERS 우선순위를 유지한다. 인식된 marker 뒤의 구문상 유효하게 파싱된 extra actor/collection URI(mention addressee), 순서·중복과 foreign/unknown/spoofed-looking followers URI는 visibility를 바꾸거나 Note 전체를 무효화하지 않는다. raw malformed audience syntax는 기존 vocabulary hydration/basic validation에서 처리한다.
- author canonical marker가 없고 Public도 없으면 actor-only DIRECT/limited audience와 foreign-followers-only audience를 FOLLOWERS로 분류하지 않고 no-op으로 건너뛴다. foreign/unknown/spoofed-looking URI를 분류하기 위한 network dereference나 `/followers` 경로 휴리스틱을 사용하지 않으며, spoofed-looking URI 자체는 권한 근거가 아니다.
- Author Profile의 기존 Post Visibility 접근은 유지한다. inbound 수신 relevance에는 Active local Profile·Active local Instance follower의 remote followee 방향 current established Follow Relationship이 필요하고, GraphQL non-author viewer에는 기존 viewer→author established 관계와 Profile/Instance eligibility 정책을 적용한다. extra actor URI는 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access의 근거가 아니다.
- Mention 관계·notification·recipient model, body/tag Mention 보존·파싱, historical backfill, outbound delivery와 followers membership mirror는 이 결과에 포함하지 않는다.

**Verification**

Public-to + extra mentioned actor URI, Public-cc + extra mentioned actor URI, canonical followers personal/shared + extra mentioned actor URI가 각각 PUBLIC/UNLISTED/FOLLOWERS로 유지되는지, actor-only·foreign-followers-only audience가 no-op인지, pending·rejected·reverse·unfollow 관계가 side effect 없이 제외되는지 확인한다.

- [x] 1.1 Public/Unlisted/Followers audience 우선순위와 verified author canonical followers URI 대조를 구현하고 각 분류에 extra mentioned actor URI 회귀를 추가한다.
- [x] 1.2 personal/shared inbox에서 Active local Profile·Active local Instance follower → remote followee established 관계를 확인하고 관계가 없거나 inactive인 delivery를 write 전에 제외한다.
- [x] 1.3 actor/object/attribution invalid, actor-only·foreign-followers-only no-op, canonical marker 뒤 foreign/unknown/spoofed-looking·duplicate·구문상 유효한 extra actor/collection URI 무시 회귀를 추가하고 raw malformed audience syntax가 기존 기본 검증을 따르는지 확인한다.

## 2. PROD-360 Followers Only materialization and idempotency

**Authority / Provenance**

- `docs/domain/objects/post.md#행동`
- `docs/architecture/core-services.md#책임`
- `PROD-360`

**Deliverable**

수신 관련성이 확인된 유효한 Note가 `PostVisibility.FOLLOWERS` Post와 첫 PostContent로 정확히 한 번 저장되고, 실패·중복·동시 delivery가 원자성과 first-write-wins를 유지한다.

**Guardrails**

- 기존 ActivityPub Post mapping·Post·PostContent transaction과 object URI unique idempotency 결과를 재사용한다.
- 하나라도 실패하면 부분 row를 남기지 않고, duplicate/concurrent loser는 rollback된 no-op으로 종료한다.
- 최초 visibility·timestamp와 content를 duplicate가 변경하지 않는다.
- DB migration, recovery transaction, explicit mapping lock와 membership mirror를 추가하지 않는다.

**Verification**

first delivery, projection failure, duplicate, personal/shared concurrent delivery를 실행해 mapping/Post/PostContent count, visibility, timestamp와 rollback 결과를 확인한다.

- [x] 2.1 validated Followers Only input을 기존 remote Post creation transaction에 전달해 FOLLOWERS visibility와 canonical content를 저장한다.
- [x] 2.2 mapping·Post·PostContent 원자성 및 projection failure rollback을 검증한다.
- [x] 2.3 동일 object URI의 duplicate/concurrent first-write-wins와 부분 row rollback을 검증한다.

## 3. PROD-360 GraphQL access lifecycle

**Authority / Provenance**

- `docs/domain/objects/post.md#조회-정책`
- `docs/domain/policies/post-list.md#후보-정책`
- `docs/architecture/core-services.md#public-contract`
- `PROD-360`

**Deliverable**

accepted follower가 저장된 remote Followers Only Post를 기존 `Post` Node, `Profile.posts`, `homeTimeline`과 상세 surface에서 조회하고, 허용되지 않은 viewer와 lifecycle 변화는 같은 visibility·eligibility policy로 차단한다.

**Guardrails**

- page limit 전에 Post Visibility와 Post Eligibility를 적용하고 기존 pagination/order와 DB-only read contract를 유지한다.
- Author Profile의 기존 허용을 보존하며, extra actor URI에서 Mentioned Profile 관계·viewer authorization을 만들지 않고 guest·non-follower·pending/rejected·reverse-only viewer는 노출하지 않는다.
- unfollow, Author Profile 비활성화와 Instance suspension/domain block은 read-time access를 제거하지만 저장 Post/mapping visibility를 바꾸거나 삭제하지 않는다.
- remote actor/object 재조회, UI cache filtering과 surface별 follower 예외를 추가하지 않는다.

**Verification**

GraphQL integration fixture에서 accepted follower와 Author Profile의 기존 접근, extra actor URI가 viewer access를 만들지 않는 결과, guest/non-follower/pending/reverse, unfollow/suspension 상태의 Node·Profile list·Home·detail 결과와 public/unlisted 회귀를 확인한다.

- [x] 3.1 기존 Post Visibility·Eligibility와 list candidate policy를 Node·Profile.posts·homeTimeline·detail에 연결한다.
- [x] 3.2 accepted follower 및 Author Profile의 허용 결과와 extra actor URI 기반 Mention/viewer authorization 미생성, guest/non-follower/pending/reverse 차단을 검증한다.
- [x] 3.3 unfollow·Profile/Instance suspension 뒤 read-time 차단과 public/unlisted 회귀를 검증한다.

## 4. PROD-360 integration verification and completion evidence

**Authority / Provenance**

- `docs/domain/objects/post.md#activitypub-local-note-표현`
- `docs/domain/objects/follow-relationship.md#조회-정책`
- `docs/domain/policies/post-list.md#후보-정책`
- `docs/architecture/core-services.md#public-contract`
- `PROD-360`

**Deliverable**

대표 외부 서버 fixture와 기존 public/unlisted regression을 포함한 end-to-end evidence, 문서 validation 및 PROD-360의 implementation/integration/archive 완료 기록을 제공한다.

**Guardrails**

- PROD-634의 common logging/Sentry 구현을 복제하지 않고, 별도 authority가 확인된 경우에만 관측 결과 호환성을 검증한다.
- raw activity body, signature와 credential을 로그·Sentry에 남기지 않는다.
- 구현 테스트와 문서 validation 결과가 canonical 계약·scope와 일치해야 하며, open blocked observability enum을 발명하지 않는다.

**Verification**

Fedify/API integration 결과, existing public/unlisted regression, formatter와 `openspec validate ingest-activitypub-followers-posts --strict` 결과를 PROD-360 evidence에 연결한다.

4.2 verification evidence (2026-08-03): the isolated Fedify suite passed all 190 tests, including existing Public/Unlisted inbound and delivery regressions, and the API GraphQL profile suite passed all 58 tests including existing Public/Unlisted authorization coverage. This change adds no PROD-634 logging or Sentry instrumentation; the upstream observability enum remains unconfirmed, so no compatibility assertion was invented.

- [x] 4.1 대표 외부 서버의 personal/shared Followers Only 수신과 GraphQL surfaces를 end-to-end로 검증한다.
- [x] 4.2 기존 public/unlisted inbound·Post authorization 회귀와 common observability boundary 호환성을 scope 중복 없이 확인한다.
- [x] 4.3 문서 formatter·strict OpenSpec validation과 change archive 전 정합성 검사를 통과시킨다.
