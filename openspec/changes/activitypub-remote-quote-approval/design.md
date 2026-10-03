## Context

Domain Gate와 Issue Gate는 2026-09-10 승인됐다. 이 change는 PROD-792가 소유한 원격 Quote 계약만 다룬다.
현재 기준 main은 `3906f2251e70a8b9bd39721c897493efbe83ff4a`다. 선행 PROD-509의 최종 materializer는
구현 착수 때 최신 계약과 검증 증거를 다시 확인한다.

현재 `inbound-create.ts`는 actor/object identity를 확인하고 Note 처리를 위임한다. 기존 projection은
content/media·visibility·Reply Parent를 처리한다. Post에는 `repostSourceId`가 있지만 ActivityPub 생성
입력에는 Quote 연결과 승인 메타데이터가 없다. GraphQL Source access는 viewer 정책을 적용하지만 원격
승인을 확인하지 않는다. Worker에도 Quote 전용 Workflow가 없다.

## Goals / Non-Goals

**Goals:** 승인·Source materialization·viewer access를 독립적으로 연결하고 철회와 늦은 결과를 안전하게
처리한다. 호환성이 검증된 Fedify 후보만 채택한다.

**Non-Goals:** proposal의 후속 범위를 유지한다. 특히 일반 Note update, IRI-only Note 추가 fetch·hydration,
authorization-only Update 표현이나 Source 대상 변경, private Source
신규 수집, 알림 생성 lifecycle, 재귀 카드와 새 API/UI를 이 작업에서 추가하지 않는다.

## Implementation Guidance

다음은 비규범적 구현 안내다. 행동 계약은 specs, 장기 제약은 decisions를 따른다.

### Current Constraints

- 조사한 `packages/fedify/package.json`은 `@fedify/fedify`가 `^2.3.0`, postgres/vocab/vocab-runtime이
  `2.3.0`이며 lockfile 해상도는 2.3.0이다. interaction-controls는 없다. 과거 registry에서 확인한 개발
  태그는 후보 선정 증거가 아니다.
- 재사용 경계는 `packages/fedify/src/inbound-create-note.ts`, `packages/core/services/post.ts`,
  `packages/core/db/tables.ts`, API의 `post/access/repost-source.ts`, Worker Workflow·Activity 등록이다.
  파일 위치와 helper 분리는 구현 시 실제 선행 결과에 맞게 조정한다.
- 기존 회귀 기반은 `packages/fedify/src/inbound-create.test.ts`와
  `apps/api/tests/integration/graphql/post-repost-source.test.ts`다. 기존 테스트 통과만으로 새 helper의
  승인서 진본 검증이나 vocabulary round-trip을 증명할 수 없다.

### Recommended Approach

1. 기능 연결에 앞서 호환 가능한 prerelease 후보 세트를 선정하고 pnpm CLI로 exact pin한다. dependency/peer와
   frozen lockfile 재현성을 확인하고 실제 vocabulary 객체 및 interaction-controls를 실행하는 compatibility
   검증을 수행한다. 기존 ActivityPub 경로 회귀까지 통과한 후보만 이후 구현에 사용한다.
2. 수신 인증 뒤 FEP 존재 여부를 보존한 채 vocabulary로 참조를 읽는다. `quoteUrl`의 라이브러리 fallback
   순서는 현재 2.3 기준 `quoteUrl`, `_misskey_quote`, `quoteUri`다. 후보 버전에서 다시 확인하며 이슈의
   필드 나열 순서를 새 우선순위로 구현하지 않는다.
3. 바깥 Post와 Quote 메타데이터의 저장을 일관되게 처리하고 commit 후 resolution을 시작한다. 원격 I/O를
   DB transaction 밖에서 수행한 뒤 현재 revision을 조건으로 결과를 반영한다. 동일 입력은 기존 revision을
   재사용하고 실제 승인 입력 변경·철회는 이전 결과를 무효화한다.
4. Source는 URI mapping을 먼저 조회하고 공개 Source만 PROD-509 경계로 확보한다. 기존 helper·core
   `createPost`와 최소 연결 변경을 사용한다. 별도 전체 Note projector는 만들지 않는다. 선행의 앞 4개 지원
   이미지 선택·추가 fetch 없음·선택 이미지 실패 시 전체 Note 거부·정규화 summary/body 합계 10,000자 제한을
   재사용한다. Note 및 exact author identity 검증은 신규 Actor 저장보다 먼저 수행한다. Actor/Profile·Instance의
   독립 commit은 Post 실패·중복으로 보상 삭제하지 않는다.
5. `quoteInteraction`의 승인서 검증을 사용한다. 로컬 정책 평가를 승인서의 진본·대상 검증 대신 사용하지
   않는다. embedded 승인서도 같은 진본 검증 경계를 통과시킨다. 비동기 결과 반영은 revision 조건과
   affected-row 결과로 승패를 판정하는 방식이 적합하다.
6. 기존 Source resolver의 접근 조건에 원격 Quote 승인 조건을 결합한다. 목록·상세·중첩 preview가 다른
   resolver 경로를 우회하지 않는지 확인한다. 원격 Quote 메타데이터가 없는 일반 Post·Local Quote에는
   기존 조회 정책을 유지한다. 신규 원격 Quote 메타데이터 저장 실패를 일반 Quote로 노출하는 우회로 삼지 않는다.
7. 인증된 embedded `Update(Note)`의 Quote 승인 정보에 한정한 Update와 승인서 Delete를 연결한다. Source Author·승인 URI 검증 후 revision을
   무효화하고 상태를 변경한다. 승인 제거와 철회 중에도 바깥 본문·Source 관계를 보존한다. 승인 참조 변경에 따른 검증 대기는
   QuoteAuthorization이 필요한 FEP 타인 인용에만 적용한다. 자기 인용·승인서 면제 legacy에는 참조 변경만으로
   대기를 추가하지 않고 현재 승인 조건과 viewer 정책으로 판정한다.
   IRI-only Update를 원격 fetch·hydrate하거나 authorization-only 표현을 새로 해석하지 않는다.

기존 `Post GraphQL object`의 전체 MODIFIED delta는 `specs/post/spec.md`에 있다. Source 자체 조회 가능성과
원격 Quote 승인 조건을 구분해 두 capability의 조회 결과를 함께 검증한다. 선행 materializer 검증은 tasks의
계약별 증거 표로 연결하고 현재 consumer나 Fedify 후보 때문에 생긴 검증 공백만 보완한다.

### Allowed Alternatives

revision 조건을 충족하는 기존 persistence helper나 제한된 transaction 조합을 사용할 수 있다. Source
materialization과 승인 검증의 내부 실행 순서는 기존 권한·I/O 경계를 보존하면 조정할 수 있다. 어떤 방법을 쓰든
stale 결과가 상태나 관계를 쓰지 못하고 duplicate/concurrent delivery가 수렴해야 한다.

### Known Traps

- FEP 해석 실패를 `quote` 부재로 처리해 레거시로 우회하거나 승인서를 단순 문자열 비교로 검증하는 것.
- Source 저장 성공, Local Quote 작성 정책 또는 승인 자체를 viewer 조회 권한으로 사용하는 것.
- Parent나 delivery actor, URI 모양에서 Source Author를 추정하는 것.
- 영구 실패를 재시도하거나 transient 상한을 전체 작업의 무한 재시작으로 우회하는 것.
- revoked 상태를 이전 Workflow 성공으로 덮거나 단순 조회 후 무조건 update해 경쟁을 허용하는 것.

## Risks / Trade-offs

- prerelease가 기존 federation을 바꿀 위험 → exact 후보·lockfile과 실행된 compatibility 증거를 묶고 실패 후보를 채택하지 않는다.
- Source 연결이 승인보다 먼저 저장되는 노출 위험 → writer 배포 전에 승인 조건을 적용하는 reader를 준비하고 API 통합 테스트로 확인한다.
- Worker·DB 저장의 시간차 → commit 후 시작과 동일 Workflow ID, 현재 revision 조건으로 중복과 지연을 처리한다.
- 선행 PROD-509와 현재 main의 차이 → 구현 전에 공개 계약과 실제 코드·검증·Stack 부모를 다시 확인한다.

## Migration Plan

1. 실제 구현 단계에서 기존 migration 정책에 따라 `activitypub_post_quote`를 additive하게 추가한다. 기존 Post나
   관계를 삭제하지 않는다. 기존 데이터에 검증되지 않은 APPROVED 상태를 일괄 채우지 않는다.
2. compatibility를 통과한 dependency 세트와 승인 조건을 이해하는 reader·Worker를 준비한 뒤 수신 writer를
   활성화한다. 배포 단위가 나뉘면 이전 reader에 새 원격 Source 관계가 노출되지 않는 순서를 검증한다.
3. 롤백 때 신규 수신/resolution을 먼저 중단하고 승인 gating을 유지한다. 이미 저장한 메타데이터·Source·본문을
   보존하며 승인 조건을 모르는 구버전 reader로 무조건 되돌리지 않는다. dependency rollback도 검증된 이전
   manifest·lockfile을 단위로 수행한다. 실패한 후보는 기능 writer 활성화 전에 제거한다.
4. PROD-792가 전체 scenario·통합 검증과 최신 canonical/Linear 대조를 완료한 뒤 delta sync·archive한다.
   개별 PR Ready/merge만으로 change 전체를 완료 처리하지 않는다.

## Open Questions

제품 요구사항의 미결정은 없다. 정확한 prerelease 후보, 실행 환경에서의 helper 호환성, 선행 materializer의
최종 API와 실제 배포 순서는 구현 준비 중 검증할 기술 항목이다. compatibility 실패는 후보 채택과 기능 구현의
중단 조건이며 새 제품 정책이나 수동 검증기를 임의로 도입할 근거가 아니다. Spec Gate 승인은 별도로 남아 있다.
