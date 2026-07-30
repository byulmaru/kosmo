## Context

이 기록은 `Profile.bio`의 canonical 평문 계약과 PROD-536의 remote actor `summary` 정규화 범위를 구현 전에 고정한다. 현재 remote Note projection, remote actor materialization/refresh, DB-only Profile 조회와 Local Profile outbound 경계를 독립적으로 대조했다.

## Decision Records

### Remote actor summary를 검증 전에 표시 가능한 평문으로 투영한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-536`
- Status: Active
- Context / Problem: actor `summary` 원문을 먼저 500자로 검증하면 HTML markup이 그대로 저장되거나, 표시 평문은 유효해도 markup 길이 때문에 bio가 유실된다.
- Decision Outcome: string 및 Fedify가 선택한 language-tagged `summary`를 표시 가능한 평문으로 먼저 투영하고, 그 결과에 `Profile.bio`의 trim·nullable·500자 검증을 적용한다. 최초 materialization과 refresh는 같은 경계를 사용하고 Local Profile 입력·outbound 표현은 변경하지 않는다. GraphQL schema, UI renderer, DB schema와 dependency도 변경하지 않는다.
- Alternatives Considered: raw HTML 저장 후 UI renderer 추가, 원문 길이 검증 후 tag 제거. 둘 다 PROD-536의 ingress 소유 경계와 평문 저장 결과를 만족하지 않는다.
- Consequences: DB, GraphQL과 모든 UI 소비자는 같은 평문 bio를 보며, 기존 raw markup을 기대한 비계약 소비 결과는 바뀐다.
- Confirmation / Follow-up: string/language-tagged insert, refresh, projection 후 길이, 비표시 내용, Local outbound 회귀를 각각 검증한다.

### 기존 ActivityPub HTML canonicalization 의미를 공유한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-536`
- Status: Active
- Context / Problem: Profile 전용 regex strip이나 새 sanitizer는 entity, block boundary, malformed markup과 script/style/template 처리 의미를 기존 remote Note 경계와 다르게 만들 수 있다.
- Decision Outcome: remote Note 수신에서 검증된 JSDOM→ProseMirror→Plain Text 의미를 remote Profile bio projection과 공유한다. helper 추출 여부와 내부 이름은 고정하지 않지만 두 진입점은 같은 parser 규칙과 회귀 fixture를 사용한다.
- Alternatives Considered: regex tag 제거, 신규 sanitizer dependency, frontend DOM/HTML renderer. 각각 malformed HTML·비표시 내용 처리, dependency/정책 중복 또는 저장 경계 미해결 문제가 있다.
- Consequences: 새 dependency 없이 기존 보안 fixture를 재사용하지만 PostContent parser 의미 변경은 Profile bio에도 영향을 줄 수 있으므로 공통 회귀 검증이 필요하다.
- Confirmation / Follow-up: entity, 링크 표시 텍스트, paragraph/hard break, malformed markup, unsafe URL, image, `hidden` 요소와 script/style/template fixture를 pure projection test에서 고정한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
