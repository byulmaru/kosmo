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

### Remote Media identity를 원본 Profile과 URL 조합으로 둔다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `PROD-625`
- Status: Active
- Context / Problem: Media는 원본 Remote Profile을 필수로 소유하지만 여러 actor가 같은 공용/default 이미지
  URL을 사용할 수 있다. 기존 URL-only uniqueness는 두 번째 Profile 표현을 저장하지 못한다.
- Decision Outcome: Remote Media uniqueness와 재사용 기준을 `(profileId, canonical URL)`로 둔다. 같은
  Profile+URL은 재사용하고 다른 Profile의 같은 URL은 별도 Media identity를 가진다.
- Alternatives Considered: 최초 Media owner를 공유하거나 변경하면 Media.Profile 관계를 위반한다. 공용 URL
  actor를 계속 제외하면 요청한 Profile 표현 materialization 결과를 보장하지 못한다.
- Consequences: 동일 URL Media row가 Profile별로 존재할 수 있고 기존 원격 Note URL 충돌 거부 동작도
  Profile 범위 재사용으로 바뀐다.
- Confirmation / Follow-up: migration catalog, 같은 Profile 재사용과 서로 다른 Profile 공용 URL 동시 저장을
  검증한다.

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

### unique index만 교체하고 데이터 backfill은 하지 않는다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/media.md`, `PROD-625`
- Status: Active
- Context / Problem: 기존 데이터는 URL 전역 unique를 만족하며 새 Profile 범위 identity는 더 완화된
  uniqueness다.
- Decision Outcome: 기존 Remote URL partial unique index를 제거하고 `(profile_id, url)` partial unique
  index를 생성하며 row backfill이나 rewrite는 하지 않는다.
- Alternatives Considered: Media row 복제나 owner 재배정은 기존 데이터에 필요 없고 참조 identity를 불필요하게
  바꾼다.
- Consequences: migration은 짧은 index DDL만 수행한다. 새 중복 URL row가 생긴 뒤 이전 schema로 즉시 rollback할
  수는 없다.
- Confirmation / Follow-up: migration SQL, catalog assertion과 기존 row 보존을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archived `project-activitypub-remote-media`의 “Remote URL identity는 owner를 바꾸지 않는다” 중 URL-only
  partial uniqueness와 다른 Profile URL 충돌 시 Note 전체 거부 선택은 현재
  `docs/domain/objects/media.md`와 `PROD-625`가 정한 Profile 범위 identity로 대체됐다. 최초 owner를
  변경하지 않는 제약은 유지한다.
