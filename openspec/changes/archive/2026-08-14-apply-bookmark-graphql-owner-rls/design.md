## Context

현재 Bookmark GraphQL loader, connection, viewer-relative loader와 create/delete service는 모두 `profile_id` application predicate를 유지한다. PROD-370은 nullable UUID actor helper를 제공하고 PROD-726은 operation connection에 selected Profile setting을 공급하지만, `bookmark` table에는 아직 RLS가 없어 non-owner `kosmo_api` 자체가 owner row 경계를 강제하지 않는다.

Bookmark row visibility는 Target Post visibility와 생명주기가 다르다. Owner는 숨겨진 Target의 Bookmark Node와 row를 유지하고 삭제할 수 있어야 하며, `Bookmark.post`와 connection edge만 기존 Post 조회 정책에 따라 숨겨진다. 따라서 Bookmark policy에서 Post table을 join하거나 Post RLS 결과를 요구하면 승인된 owner delete 계약을 깨뜨린다.

## Goals / Non-Goals

**Goals:**

- `kosmo_api` Bookmark SELECT, INSERT와 DELETE를 current selected Profile owner row로 제한한다.
- missing/empty/malformed actor context와 다른 selected Profile을 fail-closed로 처리한다.
- hidden Target Post에서도 Bookmark row와 owner delete를 유지한다.
- owner와 `kosmo_worker` BYPASSRLS, 기존 GraphQL shape·payload·pagination·application predicate를 보존한다.

**Non-Goals:**

- Post/PostContent, Reaction, Follow, Notification, Media 등 다른 table policy 변경
- GraphQL owner predicate 제거, operation session 또는 credential cutover
- Worker/Fedify/Temporal용 policy와 role/object ACL provisioning
- 파일별 migration behavior test, production preflight/sync/apply/cutover/live 검증

## Implementation Guidance

### Current Constraints

- create는 `INSERT ... ON CONFLICT DO NOTHING RETURNING` 뒤 기존 row SELECT로 중복 요청을 정규화하므로 INSERT와 SELECT가 모두 같은 owner predicate를 통과해야 한다.
- delete는 Bookmark ID와 selected Profile ID를 함께 제한하고 삭제 row를 `RETURNING`한다. Target Post를 읽지 않고 삭제해야 hidden Target에서도 동작한다.
- Bookmark Node loader와 viewer loader는 batch query에 application owner predicate를 유지한다. connection만 Post visibility join을 사용하며 이 join은 row authorization이 아니라 edge 표현 필터다.
- RLS가 활성화된 table은 command별 permissive policy가 하나도 없으면 해당 command가 기본 거부된다. 승인되지 않은 UPDATE 권한까지 열지 않도록 SELECT, INSERT, DELETE 경계를 명시적으로 분리해야 한다.
- object ACL은 PROD-724가 소유하며 이 migration은 role 생성, grant 또는 credential을 중복하지 않는다.

### Recommended Approach

Drizzle table metadata를 `pgTable.withRLS`로 바꾸고 `TO kosmo_api`인 permissive policy 세 개를 선언한다.

1. SELECT와 DELETE의 `USING`은 `bookmark.profile_id = public.kosmo_current_profile_id()`를 사용한다.
2. INSERT의 `WITH CHECK`는 같은 owner equality를 사용한다.
3. UPDATE policy는 만들지 않는다. Bookmark는 생성 시각과 관계가 불변이고 현재 GraphQL consumer도 UPDATE를 사용하지 않는다.
4. 어떤 policy에도 Post subquery를 넣지 않는다. GraphQL connection과 nullable `Bookmark.post`가 기존 Post 경계를 계속 소비한다.
5. 생성된 additive migration과 snapshot에서 RLS enabled, FORCE off, role/command/qual/check를 확인한다.

Bookmark 전용 persistent migration behavior test는 기존 smoke 파일에도 추가하지 않는다. 지속 검증은 generic blank migration replay, Drizzle schema check와 `kosmo_api` operation connection을 사용하는 기존 Bookmark GraphQL integration으로 구성한다. 정확한 branch revision의 owner/other/missing/malformed/hidden Target/Worker role matrix는 격리 PostgreSQL에서 일회성 비운영 증거로 확인하고 repository test로 고정하지 않는다.

### Allowed Alternatives

동일한 command matrix와 predicate를 보존한다면 hand-written policy DDL을 사용할 수 있다. 다만 Drizzle metadata와 snapshot이 실제 catalog와 일치해야 하고 UPDATE 또는 Post visibility 조건을 추가하면 안 된다.

### Known Traps

- `TO PUBLIC`, role 생략 또는 `kosmo_worker` policy 추가는 GraphQL-only 권한 경계를 넓힌다.
- `FOR ALL` owner policy는 현재 계약에 없는 Bookmark UPDATE도 허용하므로 command 범위를 불필요하게 넓힌다.
- Post visibility를 SELECT/DELETE predicate에 결합하면 hidden Target의 Bookmark Node와 owner delete가 사라진다.
- Profile helper의 `NULL`을 wildcard로 처리하면 guest, account-only 또는 malformed context가 private row를 얻는다.
- application predicate를 즉시 제거하면 PROD-767 coverage gate와 principal cutover 책임을 선점한다.
- migration/CI/Ready PR을 production 적용이나 runtime cutover 증거로 해석하면 안 된다.

## Risks / Trade-offs

- [RLS와 application predicate가 전환 기간 중복된다] → PROD-767/716이 전체 coverage와 cutover를 완료하기 전까지 defense in depth로 유지한다.
- [세 개의 command policy가 한 개 `FOR ALL`보다 객체 수가 많다] → 불변 Bookmark에 승인되지 않은 UPDATE를 열지 않는 최소 권한을 우선한다.
- [hidden Target row를 RLS가 계속 보이게 한다] → 이는 승인된 owner 관계 유지 계약이며 GraphQL Post field와 connection에서 기존 visibility 경계를 적용한다.
- [role-level integration이 환경 의존적일 수 있다] → repository의 격리 test database와 기존 role/helper migration chain을 사용하고 production 자원을 사용하지 않는다.

## Migration Plan

1. Bookmark schema metadata, additive policy migration과 snapshot을 같은 변경으로 추가한다.
2. blank database replay와 existing GraphQL regression을 지속 검증하고, 격리 PostgreSQL `kosmo_api`/`kosmo_worker` matrix는 정확한 branch revision의 일회성 비운영 증거로 확인한다.
3. workload가 owner credential을 사용하는 동안 migration이 배포돼도 principal cutover 완료로 보지 않는다.
4. cutover 전 rollback이 필요하면 새 forward migration으로 Bookmark policy를 제거하고 RLS를 비활성화한다. 적용된 migration history는 수정하지 않는다.
5. production preflight, sync/apply, credential cutover와 live 검증은 별도 승인과 downstream 이슈가 소유한다.

## Open Questions

없음.
