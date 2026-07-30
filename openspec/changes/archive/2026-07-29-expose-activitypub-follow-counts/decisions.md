## Context

`docs/domain/objects/profile.md`가 정의한 공개 가능한 저장 count 정책과 PROD-560이 정의한 ActivityPub wire 표현을
Local actor discovery 계약과 현재 Fedify 경계에 적용한다. collection URI와 직렬화 형식은 downstream OpenSpec이
소유하며 canonical 도메인 문서로 승격하지 않는다.

## Decision Records

### Social graph collection은 count만 공개한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-560
- Status: Active
- Context / Problem: 원격 서버에 팔로워·팔로잉 수는 제공해야 하지만 membership 목록의 공개 범위는 확정되지
  않았다.
- Decision Outcome: actor는 followers/following collection URI를 광고하고 각 collection은 저장 count를
  `totalItems`로 제공한다. membership item과 pagination reference는 제공하지 않는다.
- Alternatives Considered: actor-level 비표준 count 속성은 ActivityStreams collection 상호운용 계약이 아니므로
  선택하지 않았다. membership 전체 공개는 승인된 범위를 넘으므로 선택하지 않았다.
- Consequences: count를 읽는 원격 서버는 표준 collection을 사용할 수 있지만 관계 membership은 알 수 없다.
- Confirmation / Follow-up: actor와 collection JSON wire 테스트에서 URI, `totalItems`, 빈 membership과 pagination
  부재를 검증한다.

### 저장 count를 그대로 사용한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-560
- Status: Active
- Context / Problem: collection 요청마다 관계를 aggregate하면 GraphQL과 follow lifecycle이 유지하는 저장 count
  projection과 별도 정확성 계약이 생긴다.
- Decision Outcome: followers는 `Profiles.followersCount`, following은 `Profiles.followingCount`를
  `totalItems`로 반환하며 요청 중 관계 aggregate query를 수행하지 않는다.
- Alternatives Considered: `ProfileFollows` 실시간 aggregate와 count backfill은 이번 계약의 범위를 넓히므로
  선택하지 않았다.
- Consequences: 노출 count는 기존 best-effort 의미를 유지하며 visible membership 수와 항상 같다고 보장하지 않는다.
- Confirmation / Follow-up: 서로 다른 저장 count를 설정한 integration test에서 각 collection이 대응 값을 반환하는지
  검증한다.

### HTTP count collection과 outbound fan-out을 분리한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-560
- Status: Active
- Context / Problem: HTTP collection은 membership을 비워야 하지만 outbound delivery는 실제 established followers를
  확장해야 한다.
- Decision Outcome: count-only collection dispatcher는 HTTP root federation에만 등록하고, outbound recipient
  dispatcher와 `localOutboundFederation`의 membership expansion은 변경하거나 재사용하지 않는다.
- Alternatives Considered: 하나의 dispatcher를 HTTP membership과 delivery fan-out에 공용하면 membership이
  노출되거나 delivery recipient가 0명이 되므로 선택하지 않았다.
- Consequences: read와 delivery가 서로 다른 projection을 명시적으로 유지하며 이번 변경은 PROD-512 delivery 동작에
  영향을 주지 않는다.
- Confirmation / Follow-up: 기존 outbound delivery 테스트를 유지하고 새 테스트는 HTTP federation singleton만
  대상으로 한다.

### Collection 조회는 actor key lifecycle을 실행하지 않는다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-560
- Status: Active
- Context / Problem: actor document helper는 key가 없으면 생성하지만 count collection은 Profile 공개 여부와 저장
  count만 필요하다.
- Decision Outcome: collection callback은 key 생성 없이 Active Local Profile read projection을 조회한다.
- Alternatives Considered: actor ensure 경계를 재사용하면 read-only collection 요청이 actor metadata와 key를 생성하므로
  선택하지 않았다.
- Consequences: collection GET은 DB read만 수행하고 actor key 저장 생명주기를 바꾸지 않는다.
- Confirmation / Follow-up: collection 구현이 actor ensure helper를 호출하지 않는지 코드 경계와 테스트 fixture로
  확인한다.

### Configured Local Instance 검사는 현재 runtime 안전 경계다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/instance.md`, PROD-560, PROD-376
- Status: Active
- Context / Problem: 도메인 계약은 여러 Local Instance를 허용하지만 현재 federation runtime은 `PUBLIC_ORIGIN`에
  대응하는 configured Local Instance 하나만 해석한다.
- Decision Outcome: 이번 collection dispatcher는 현재 runtime과 같은 configured Local Instance 및 canonical Host
  검사를 유지한다. 이를 영구적인 단일 origin 계약으로 해석하지 않는다.
- Alternatives Considered: 이 이슈에서 request origin별 instance resolver까지 구현하면 PROD-376의 actor, key,
  inbox/outbox identity 전환과 분리되어 일부 route만 다중 origin을 지원하게 되므로 선택하지 않았다.
- Consequences: 현재 지원하지 않는 origin이나 다른 Local Instance의 Profile을 교차 노출하지 않으며, 다중 instance
  지원 전까지 collection endpoint도 configured origin 하나에서만 동작한다.
- Confirmation / Follow-up: PROD-376은 request origin별 Local Instance resolver를 도입할 때 followers/following
  collection dispatcher와 count 조회도 함께 전환하고 기존 configured origin의 URI를 유지한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
