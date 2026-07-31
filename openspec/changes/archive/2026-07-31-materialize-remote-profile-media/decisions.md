## Context

이 기록은 `PROD-625`와 canonical Profile/Media 문서가 정한 원격 actor avatar/header materialization을 기존
Remote Media와 actor refresh 경계에 적용하기 위한 durable 선택을 추적한다.

## Decision Records

### embedded actor 표현만 추가 fetch 없이 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `PROD-625`
- Status: Active
- Context / Problem: Fedify actor의 `icon`/`image` accessor는 embedded 표현을 반환할 수도, IRI-only 값을
  dereference할 수도 있다. 원격 Profile materialization에 새 resource budget과 retry 경계를 추가하지 않고
  실제 표현을 수집할 범위를 고정해야 한다.
- Decision Outcome: hydrate된 actor payload 안의 embedded 표현만 사용하고 정확히 하나의 canonical HTTP(S)
  URL을 가진 경우에만 후보로 만든다. IRI-only와 부적합한 표현은 추가 fetch 없이 해당 kind가 없는 것으로
  처리한다.
- Alternatives Considered: IRI-only hydration은 별도 network/resource 정책이 필요해 제외한다. 부적합 표현
  때문에 actor 전체를 거부하면 Profile identity와 scalar까지 사라지므로 선택하지 않는다.
- Consequences: embedded 표현을 보내는 서버와는 상호운용하지만 IRI-only avatar/header는 표시되지 않는다.
- Confirmation / Follow-up: no-network loader와 invalid/IRI-only 회귀 테스트로 검증한다.

### Remote URL을 Media identity로 사용하지 않는다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `PROD-625`
- Status: Active
- Context / Problem: 기존 구현은 Remote URL을 Media identity로 사용해 서로 다른 Note attachment나 Profile
  표현이 같은 URL을 쓰면 하나의 Media로 합치고 Media Type/Alt Text를 덮어쓸 수 있다.
- Decision Outcome: Remote URL은 원본 위치 속성으로만 저장하고 uniqueness나 재사용 기준으로 사용하지 않는다.
  서로 다른 Post attachment는 Profile과 URL이 같아도 별도 Media를 만든다. avatar/header는 URL이 같아도 kind별
  별도 Media를 가진다. 같은 kind refresh는 URL 검색이 아니라 현재 ProfileMedia 관계가 가리키는 Media만 동일
  URL일 때 유지·갱신한다.
- Alternatives Considered: URL-only 또는 Profile+URL uniqueness는 서로 다른 표현을 합치므로 제외한다. refresh
  때마다 무조건 새 Media를 만들면 변하지 않은 같은 kind 표현에도 orphan이 누적되어 현재 관계 문맥의 갱신을
  선택했다.
- Consequences: 동일 URL Media row가 여러 개 존재할 수 있고 각 표현의 metadata가 독립적으로 보존된다.
- Confirmation / Follow-up: URL index 부재, 같은 URL의 Post attachment 및 avatar/header 분리와 같은 kind refresh
  identity 유지를 검증한다.

### actor scalar와 Profile 표현을 한 transaction에서 동기화한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-625`
- Status: Active
- Context / Problem: 최초 lookup, stale refresh와 inbound Update가 Profile scalar와 표현의 서로 다른 시점을
  노출하면 한 actor version의 부분 projection이 저장된다.
- Decision Outcome: 기존 actor materialization transaction 안에서 Profile과 ActivityPubActor 갱신 뒤
  avatar/header Media 및 ProfileMedia 관계를 생성·교체·제거한다. 제거된 관계의 기존 Media는 삭제하지 않는다.
- Alternatives Considered: 후속 비동기 Media 동기화는 부분 상태와 별도 retry/ordering을 만든다. 관계 제거 때
  Media 삭제는 PostContent 또는 다른 참조를 깨뜨릴 수 있다.
- Consequences: 표현 저장 실패는 actor 갱신 전체를 rollback하며 orphan Media cleanup은 별도 lifecycle로
  남는다.
- Confirmation / Follow-up: 최초 생성, refresh 교체·제거와 강제 저장 실패 rollback 테스트로 검증한다.

### Remote URL unique index는 transition과 contract 두 단계로 제거한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/media.md`, `PROD-625`
- Status: Active
- Context / Problem: 기존 URL partial unique index가 URL 기반 identity와 conflict reuse를 database contract로
  강제한다.
- Decision Outcome: 첫 PR은 전역 index를 `(profile_id, url)` compatibility index로 바꾸고 index 유무에 모두
  호환되는 application을 만든다. 별도 contract PR에서 compatibility index를 제거한다. 프로덕션은 아직
  실서비스 전이므로 active/preview workload 배수나 rollback window 대기는 적용하지 않으며 row backfill이나
  rewrite도 하지 않는다.
- Alternatives Considered: `(profile_id, url)` 또는 `(profile_id, kind, url)` index도 URL을 identity 일부로
  만들며 관계 문맥을 Media table에 중복하므로 제외한다.
- Consequences: transition schema에서 만든 공유 avatar/header는 contract 뒤 첫 refresh부터 분리된다. 기존
  Media row와 참조는 migration에서 보존한다. 실서비스 데이터와 트래픽이 없으므로 이전 URL identity schema로의
  운영 rollback 호환성은 gate가 아니다.
- Confirmation / Follow-up: PR #479 merge와 실서비스 전 운영 조건을 PROD-627에 기록하고 index 부재, 기존 row
  보존과 같은 URL의 독립 저장을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archived `project-activitypub-remote-media`의 URL-only partial uniqueness, 같은 URL 재사용과 다른 Profile URL
  충돌 거부 선택은 `docs/domain/objects/media.md`, PROD-625와 2026-07-31 사용자 결정에 따라 폐기한다. 기존
  Media의 owner를 변경하지 않는 제약은 유지한다.
