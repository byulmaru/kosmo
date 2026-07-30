## Context

Local actor는 `packages/fedify/src/federation.ts`의 Fedify actor dispatcher와
`local-profile-person.ts`의 `Person` projection으로 제공된다. Fedify root federation에는 followers/following
collection dispatcher가 없다. 저장 count는 이미 `Profiles.followersCount`와 `Profiles.followingCount`에 있고
GraphQL과 follow lifecycle이 이를 유지한다.

HTTP federation singleton과 outbound delivery용 `localOutboundFederation`은 분리되어 있다. PROD-512의 outbound
recipient dispatcher는 `ProfileFollows`를 직접 확장하므로, 이번 read-only collection을 delivery membership
source로 사용하지 않는다.

## Goals / Non-Goals

**Goals:**

- actor에 canonical followers/following URI를 광고한다.
- 각 URI에서 저장 count를 `totalItems`로 제공한다.
- actor와 같은 Local Active Profile 조회 조건을 적용한다.
- membership을 조회하거나 직렬화하지 않는다.

**Non-Goals:**

- membership 또는 pagination 공개
- count 재계산, backfill이나 DB schema 변경
- outbound recipient expansion 변경
- remote collection fetch/mirror, GraphQL 또는 UI 변경

## Implementation Guidance

### Current Constraints

- Fedify는 followers/following dispatcher가 등록되어야 `Context.getFollowersUri()`와
  `Context.getFollowingUri()`를 actor projection에서 사용할 수 있다.
- Fedify collection counter와 item dispatcher는 별도 callback이므로 unavailable Profile에서 item dispatcher가
  무조건 빈 목록을 반환하면 count가 없어도 잘못된 HTTP 200 collection이 만들어진다.
- collection 요청에서 actor key를 생성할 필요가 없으므로 key lifecycle을 포함하는
  `ensureDrizzleLocalProfileActor()`를 재사용하면 불필요한 mutation이 생긴다.
- root HTTP federation의 count-only dispatcher는 outbound delivery용 `localOutboundFederation`과 다른 경계다.
- 도메인 계약은 서로 다른 domain을 가진 여러 Local Instance를 허용하지만, 현재 federation runtime은
  `PUBLIC_ORIGIN`에 대응하는 configured Local Instance 하나만 해석한다. 이 제한은 현재 구현의 안전 경계이며
  영구적인 단일 origin 계약이 아니다.

### Recommended Approach

root federation에 followers/following dispatcher를 등록하고, 현재 HTTP federation entry에서 canonical Host와
configured Local Instance의 Profile 식별자를 검증한 뒤 Active Local Profile의 두 저장 count만 DB에서 직접
조회한다. 각 item dispatcher는 Profile이 없으면 `null`, 있으면 빈 items를 반환하고, counter는 같은 공개 조건을
통과한 Profile의 해당 저장 count를 반환한다.

actor `Person`은 Fedify context가 생성한 두 collection URI를 사용한다. 이를 통해 actor와 collection route가 같은
canonical URI template을 공유한다. wire 테스트는 actor reference, collection `id`/`type`/`totalItems`, 빈
membership과 unavailable Profile의 404를 검증한다.

PROD-376이 request origin별 Local Instance 해석을 구현할 때 이 collection dispatcher와 count 조회도 같은 resolver로
전환한다. 기존 configured origin의 collection URI와 count 계약은 유지한다.

### Allowed Alternatives

Fedify의 built-in collection dispatcher와 같은 URI·응답·공개 조건을 보장하고 outbound delivery membership과
분리된다면 custom object dispatcher를 사용할 수 있다.

### Known Traps

- collection 응답에서 `ProfileFollows`를 조회하거나 저장 count 대신 aggregate하면 기존 count projection 계약을
  우회한다.
- root count-only dispatcher를 outbound followers fan-out source로 재사용하면 실제 recipient가 0명이 되므로 delivery
  경계와 결합하면 안 된다.
- collection 요청에서 local actor metadata/key를 생성하면 read-only count 조회가 identity mutation을 일으킨다.

## Risks / Trade-offs

- [저장 count가 실제 공개 가능한 관계 수와 일시적으로 다를 수 있음] → 기존 best-effort count 계약을 그대로
  노출하고 membership 정확성을 주장하지 않는다.
- [Fedify callback 분리로 같은 Profile을 두 번 조회할 수 있음] → 작은 read-only endpoint의 단순성을 우선하며 DB
  aggregate나 request cache를 새로 만들지 않는다.
- [빈 items 속성이 직렬화될 수 있음] → membership identifier가 없고 pagination reference가 없다는 wire 결과를
  검증한다.

## Migration Plan

DB migration은 없다. actor와 collection wire contract를 함께 배포한다. rollback은 dispatcher 등록과 actor의 두 URI를
함께 제거하고 이전 OpenSpec 계약으로 되돌린다.

## Open Questions

없음.
